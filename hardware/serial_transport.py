#!/usr/bin/env python3
"""Small POSIX serial transport. The parent owns framing and device policy."""

import base64
import binascii
import errno
import fcntl
import json
import os
import select
import signal
import sys
import termios
import time

MAX_PENDING = 4096
MAX_LINE = 8192
CLOSE_TIMEOUT_SECONDS = 2.0


def emit(kind, **fields):
    data = (json.dumps(dict(kind=kind, **fields), separators=(",", ":")) + "\n").encode("utf-8")
    while data:
        try:
            written = os.write(1, data)
            data = data[written:]
        except InterruptedError:
            continue


def stop(_signum, _frame):
    raise KeyboardInterrupt


def configure(fd):
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] &= ~(termios.CSIZE | termios.PARENB | termios.CSTOPB)
    for flag in ("CRTSCTS", "CNEW_RTSCTS"):
        attrs[2] &= ~getattr(termios, flag, 0)
    attrs[2] |= termios.CS8 | termios.CLOCAL | termios.CREAD
    attrs[3] = 0
    attrs[4] = termios.B115200
    attrs[5] = termios.B115200
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 0
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    if hasattr(termios, "TIOCEXCL"):
        try:
            fcntl.ioctl(fd, termios.TIOCEXCL)
        except OSError as error:
            unsupported = {errno.EINVAL, errno.ENOTTY, errno.ENOSYS}
            unsupported.add(getattr(errno, "ENOTSUP", errno.EINVAL))
            if error.errno not in unsupported:
                raise


def relay(fd):
    pending = bytearray()
    incoming = bytearray()
    closing = False
    close_deadline = None
    while True:
        if closing and not pending:
            return 0
        if close_deadline is not None and time.monotonic() >= close_deadline:
            emit("error", message="The serial device did not finish its pending write.")
            return 1
        readers = [fd] if closing else [0, fd]
        try:
            readable, writable, _ = select.select(readers, [fd] if pending else [], [], 0.25)
        except InterruptedError:
            continue

        if 0 in readable:
            chunk = os.read(0, 4096)
            if not chunk:
                if incoming.strip():
                    emit("error", message="The serial transport received an incomplete command.")
                    return 1
                closing = True
                close_deadline = time.monotonic() + CLOSE_TIMEOUT_SECONDS
            else:
                incoming.extend(chunk)
                while b"\n" in incoming:
                    line, _, remainder = incoming.partition(b"\n")
                    incoming = bytearray(remainder)
                    if len(line) > MAX_LINE:
                        emit("error", message="The serial transport command is too long.")
                        return 1
                    try:
                        command = json.loads(line)
                        if not isinstance(command, dict):
                            raise ValueError
                        if set(command) == {"close"} and command["close"] is True:
                            closing = True
                            close_deadline = time.monotonic() + CLOSE_TIMEOUT_SECONDS
                            incoming.clear()
                            break
                        if set(command) != {"write"} or not isinstance(command["write"], str):
                            raise ValueError
                        data = base64.b64decode(command["write"], validate=True)
                    except (ValueError, TypeError, binascii.Error, UnicodeError):
                        emit("error", message="The serial transport received an invalid command.")
                        return 1
                    if len(pending) + len(data) > MAX_PENDING:
                        emit("error", message="The serial transport write queue is full.")
                        return 1
                    pending.extend(data)
                if len(incoming) > MAX_LINE:
                    emit("error", message="The serial transport command is too long.")
                    return 1

        if fd in readable:
            try:
                data = os.read(fd, 4096)
            except BlockingIOError:
                data = None
            except InterruptedError:
                data = None
            except OSError:
                emit("error", message="The serial connection was interrupted.")
                return 1
            if data == b"":
                emit("error", message="The serial connection was interrupted.")
                return 1
            if data:
                emit("data", data=base64.b64encode(data).decode("ascii"))

        if fd in writable and pending:
            try:
                written = os.write(fd, pending)
                if written > 0:
                    del pending[:written]
            except (BlockingIOError, InterruptedError):
                pass
            except OSError:
                emit("error", message="The serial connection could not accept data.")
                return 1


def main():
    if len(sys.argv) != 2:
        emit("error", message="A serial device must be selected.")
        return 2
    fd = None
    try:
        try:
            fd = os.open(sys.argv[1], os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        except OSError:
            emit("error", message="Could not open the serial device. Close any serial monitor and try again.")
            return 1
        try:
            configure(fd)
        except (OSError, termios.error):
            emit("error", message="Could not configure the serial device.")
            return 1
        emit("open")
        return relay(fd)
    except (KeyboardInterrupt, BrokenPipeError):
        return 0
    except Exception:
        emit("error", message="The serial transport stopped unexpectedly.")
        return 1
    finally:
        if fd is not None:
            try:
                os.close(fd)
            except OSError:
                pass


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, stop)
    sys.exit(main())
