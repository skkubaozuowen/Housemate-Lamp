import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../hardware/serial_transport.py', import.meta.url));
const python = '/usr/bin/python3';
const available = process.platform !== 'win32' && spawnSync(python, ['-c', 'import pty, termios'], { timeout:3000 }).status === 0;
const harness = String.raw`
import base64, json, os, pty, select, subprocess, sys, termios, time
helper, case = sys.argv[1:]
master, slave = pty.openpty()
device = os.ttyname(slave)
wrapper = '''import errno, os, runpy, sys
original = os.write
calls = 0
def limited(fd, data):
    global calls
    if fd > 2:
        calls += 1
        if calls % 3 == 0:
            raise BlockingIOError(errno.EAGAIN, 'forced short-write test')
        return original(fd, data[:7])
    return original(fd, data)
os.write = limited
sys.argv = sys.argv[1:]
runpy.run_path(sys.argv[0], run_name='__main__')
'''
command = [sys.executable, '-u', '-c', wrapper, helper, device] if case == 'partial' else [sys.executable, '-u', helper, device]
child = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
events = []
output = bytearray()
def event(timeout=3):
    deadline = time.monotonic() + timeout
    while b'\n' not in output:
        ready, _, _ = select.select([child.stdout], [], [], max(0, deadline-time.monotonic()))
        assert ready, 'helper output timed out'
        chunk = os.read(child.stdout.fileno(), 4096)
        assert chunk, 'helper exited without an event'
        output.extend(chunk)
    line, _, rest = output.partition(b'\n')
    output[:] = rest
    value = json.loads(line)
    events.append(value)
    return value
def send(value):
    child.stdin.write((json.dumps(value)+'\n').encode())
    child.stdin.flush()
def read_master(length):
    received = bytearray()
    deadline = time.monotonic()+3
    while len(received) < length:
        ready, _, _ = select.select([master], [], [], max(0, deadline-time.monotonic()))
        assert ready, 'serial output timed out'
        received.extend(os.read(master, length-len(received)))
    return bytes(received)
try:
    assert event() == {'kind':'open'}
    if case in ('roundtrip', 'partial', 'eof'):
        attrs = termios.tcgetattr(slave)
        assert attrs[0] == 0 and attrs[1] == 0 and attrs[3] == 0
        assert attrs[4] == termios.B115200 and attrs[5] == termios.B115200
        assert attrs[2] & termios.CSIZE == termios.CS8
        assert attrs[2] & termios.CLOCAL and attrs[2] & termios.CREAD
        assert not attrs[2] & (termios.PARENB | termios.CSTOPB | getattr(termios,'CRTSCTS',0))
        payload = bytes(range(256))*3
        encoded = (json.dumps({'write':base64.b64encode(payload).decode()})+'\n').encode()
        child.stdin.write(encoded[:19]); child.stdin.flush()
        child.stdin.write(encoded[19:]); child.stdin.flush()
        if case == 'eof':
            child.stdin.close()
        assert read_master(len(payload)) == payload
        if case != 'eof':
            inbound = b'\x00\xffHML READY 1 256 6 3\r\nACK 255\n'
            os.write(master, inbound)
            decoded = bytearray()
            while len(decoded) < len(inbound):
                response = event()
                assert response['kind'] == 'data'
                decoded.extend(base64.b64decode(response['data']))
            assert decoded == inbound
            send({'close':True})
        assert child.wait(timeout=3) == 0
    elif case == 'invalid':
        send({'write':'not base64!'})
        failure = event()
        assert failure['kind'] == 'error' and 'invalid command' in failure['message']
        assert child.wait(timeout=3) == 1
    elif case == 'capacity':
        send({'write':base64.b64encode(b'x'*4097).decode()})
        failure = event()
        assert failure['kind'] == 'error' and 'queue is full' in failure['message']
        assert child.wait(timeout=3) == 1
    elif case == 'line':
        child.stdin.write(b'x'*8193); child.stdin.flush()
        failure = event()
        assert failure['kind'] == 'error' and 'too long' in failure['message']
        assert child.wait(timeout=3) == 1
    elif case == 'unplug':
        os.close(master); master = None
        failure = event()
        assert failure['kind'] == 'error' and 'interrupted' in failure['message']
        assert child.wait(timeout=3) == 1
    stderr = child.stderr.read()
    assert not stderr, 'transport exposed stderr or a traceback'
    assert all(device not in json.dumps(value) for value in events)
    print(json.dumps({'ok':True,'case':case}))
finally:
    if child.poll() is None:
        child.kill(); child.wait(timeout=3)
    if master is not None: os.close(master)
    os.close(slave)
`;

for (const [scenario, description] of [
  ['roundtrip', 'raw 115200 configuration and binary data in both directions'],
  ['partial', 'partial writes and serial EAGAIN preserve every byte'],
  ['eof', 'stdin EOF drains pending data and closes cleanly'],
  ['invalid', 'invalid base64 returns a safe error'],
  ['capacity', 'pending serial writes are bounded at 4096 bytes'],
  ['line', 'unterminated command lines have a bounded size'],
  ['unplug', 'device removal returns a safe error without a traceback']
]) test(`POSIX serial transport: ${description}`, { skip:!available }, () => {
  const result = spawnSync(python, ['-c', harness, helper, scenario], { encoding:'utf8', timeout:10000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), { ok:true, case:scenario });
});
