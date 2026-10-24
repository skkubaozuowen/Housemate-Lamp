# Housemate Lamp: Arduino USB adapter

This sketch receives the webpage's existing 16 × 16 RGB frames through the local Node server. It does not interpret text or run an AI model. The 20 existing light responses, palette selection, crossfades, and reduced-motion behavior remain in the webpage.

## Hardware and first use

Current firmware target: an Arduino Nano with an ATmega328P-compatible processor, a 256-pixel WS2812B matrix, and Adafruit NeoPixel. Confirm the board processor and bootloader before uploading; an FT232 USB interface alone does not identify the processor. Uploading replaces the board's previous sketch.

| Matrix connection | Arduino / supply |
| --- | --- |
| DIN | D6, not DOUT |
| GND | Arduino GND and the external supply GND |
| +5 V | Regulated 5 V supply suitable for the matrix |

The webpage cannot establish the external supply's voltage, current rating, or wiring. A 256-pixel matrix must not be assumed safe to power through the Nano's USB connector or 5 V pin. Verify the separate supply and its wiring before raising brightness; avoid feeding the external supply into the computer's USB power path. Adafruit's [power guidance](https://learn.adafruit.com/adafruit-neopixel-uberguide/powering-neopixels) and [best practices](https://learn.adafruit.com/adafruit-neopixel-uberguide/best-practices) describe shared ground, power sizing, a data resistor, and an input capacitor. The software limit is conservative, not proof that an unknown supply is adequate.

The compile-time `HOUSEMATE_MAX_BRIGHTNESS` defaults to **3 / 255**. Every received brightness request is clamped to this limit. The initial state and watchdog state are off. Do not change the cap until the supply has been checked. Even a low cap does not remove the pixels' own idle consumption.

Install the `Adafruit NeoPixel` Arduino library, compile `HousemateLamp/HousemateLamp.ino`, and upload it using the confirmed board and bootloader. The sketch uses `NEO_GRB + NEO_KHZ800`, D6, 115200 baud, and 256 LEDs. The serial monitor must be closed before the local server opens the same port.

The connected board was probed with avrdude: signature `1E 95 0F`, responding at the Nano Old Bootloader upload rate of 57600 baud. The serial application rate is 115200 baud. On this Mac the existing Arduino IDE includes the CLI and Adafruit NeoPixel library. From the repository root, compile and upload with the selected USB port:

```sh
arduino-cli compile --fqbn arduino:avr:nano:cpu=atmega328old --output-dir .local-hardware/build hardware/HousemateLamp
arduino-cli upload --fqbn arduino:avr:nano:cpu=atmega328old --port /dev/cu.YOUR_USB_PORT --input-dir .local-hardware/build hardware/HousemateLamp
npm run start:lamp
```

If `arduino-cli` is not on PATH on this Mac, its installed executable is `/Applications/Arduino IDE.app/Contents/Resources/app/lib/backend/resources/arduino-cli`. Stop or disconnect the local lamp service before uploading. The original 32768-byte flash was read to `.local-hardware/backups/arduino-before-20261024.hex` before upload; this directory is ignored by Git. The new sketch compiles to 5164 bytes flash and 252 bytes static SRAM, plus the NeoPixel library's 768-byte runtime pixel allocation.

## Local webpage connection

The browser sends frames to the Node server on the same computer as the USB-connected Arduino. The server handles serial access. Open the local Housemate page and use its lamp connection control; opening a serial port can reset the Nano, so the bridge must wait for the firmware handshake.

A Railway server has no access to this computer's USB port. The cloud page is not a replacement for this local USB bridge. The lamp receives RGB data and control commands, never the OpenAI API key or the user's conversation text.

## Binary protocol, version 1

Every host packet has this layout:

| Field | Bytes | Meaning |
| --- | --- | --- |
| Magic | 4 | ASCII `HML1` |
| Command | 1 | ASCII `F`, `P`, `O`, or `H` |
| Sequence | 1 | Unsigned 0–255, echoed in the response |
| Payload length | 2 | Unsigned little-endian |
| Payload | 0 or 769 | Defined below |
| CRC | 2 | CRC-16/CCITT-FALSE, little-endian |

CRC parameters: polynomial `0x1021`, initial value `0xFFFF`, no reflection, no final XOR. The CRC covers command, sequence, the two length bytes, and payload. It excludes the four magic bytes and the trailing CRC itself. The standard ASCII `123456789` check value is `0x29B1`.

| Command | Payload | Action |
| --- | --- | --- |
| `H` | Empty | Return capabilities, then ACK |
| `P` | Empty | Keep the current displayed frame alive, then ACK |
| `O` | Empty | Clear the matrix, show off, then ACK |
| `F` | One brightness byte followed by 768 RGB bytes | Decode 256 RGB triples; show only after a valid CRC, then ACK |

On startup, after clearing the matrix, and in response to `H`, the sketch sends `HML READY 1 256 6 3\n`. The final field is the **actual compiled brightness cap**, so it changes if the macro is overridden. Successful packets return `ACK <sequence>\n`. Failures with an available sequence return `NAK <sequence> command\n`, `length\n`, `crc\n`, or `timeout\n`. Arduino's `println` emits CRLF; the host must accept both LF and CRLF. Allocation failure emits `HML ERROR memory` and never reports READY.

Only the exact lengths above are accepted. Invalid headers are rejected immediately without allocating or draining an attacker-selected payload length; the parser resumes scanning for magic. For a valid frame header, all 769 payload bytes are consumed as data, even if they contain `HML1`. A gap of 250 ms during a packet abandons it. After a failed or interrupted packet, the host should allow this interbyte timeout to expire before retrying if the receiver's position is uncertain.

At 115200 baud, a complete 779-byte frame requires about 68 ms on the wire, excluding LED output and turnaround. Send at most 8–10 frames per second, keep only the newest pending frame, and allow **one unacknowledged command at a time**. This includes pings and off commands. ACK is sent after `show()`, because on this AVR target NeoPixel output briefly disables interrupts and incoming serial bytes can be lost during that interval. A matching ACK, not merely a successful port-open or host write, confirms display.

## Color, matrix order, and memory

The wire format is always **RGB**. `NEO_GRB` configures the physical LED wire order inside the library; the host must not swap RGB to GRB a second time. The firmware applies `Adafruit_NeoPixel::gamma8` to each raw channel, then rounds `gamma8(channel) × cappedBrightness / 255`. It does not call the library's destructive `setBrightness()` rescaling, so a zero-brightness frame cannot erase the colors of a later frame. The physical lamp is intentionally dim until its power arrangement is confirmed; it will not match the monitor's apparent brightness exactly.

Firmware pixel index `i` is the `i`th received RGB triple. The local adapter must map the browser's row-major 16 × 16 image to the matrix's physical chain order, including any alternating snake rows, rotation, or reflection. Confirm this with a low-brightness corner/orientation pattern; no physical orientation can be inferred from DIN/D6 alone.

Only the NeoPixel library's 768-byte pixel buffer is allocated. The parser stores a three-byte RGB scratch value and small scalar fields. It updates that buffer as bytes arrive, but never calls `show()` until the whole frame and CRC are valid. A corrupt or partial frame therefore leaves the previously latched physical image unchanged. The next valid full frame overwrites every pixel before display. The sketch avoids a second 768-byte receive buffer because a classic Nano has only 2 KB SRAM.

## Hold, pause, and disconnect

Any valid command refreshes the four-second firmware watchdog. A healthy browser connection must send pings independently of animation frames: finite scenes, pause, hidden tabs, and reduced motion can stop the renderer's RAF. The Node bridge must stop keepalives when its browser lease ends; otherwise a Node process that outlives the tab would keep an old frame alive indefinitely. Watchdog expiry clears and shows the matrix once. Only a later complete, valid `F` lights it again; a ping alone does not restore a prior frame. `O` is also serialized behind the current ACK and clears the matrix explicitly.

The four-second interval uses Arduino `millis()`. On AVR, time spent with interrupts disabled during LED output is not fully counted, so the actual wall-clock timeout can be slightly longer while frames are streaming.

## Verification scope

Software verification should cover CRC vectors, exact packet lengths, payload bytes containing magic, truncated packets and timeout recovery, ACK ordering, sequence rollover, bounded latest-frame queuing, browser-lease expiry, and the existing renderer regressions. Board compilation checks processor compatibility and memory usage. Hardware checks remain separate: power and shared ground, detected firmware READY/capabilities, low-brightness RGB order, matrix orientation, visible response, pause/hold, and actual disconnect-to-off behavior. Compilation or a host-side ACK parser test alone does not establish that the physical lamp works.

References: [Arduino Nano official specification](https://store.arduino.cc/arduino-nano), [Adafruit NeoPixel implementation and output timing](https://github.com/adafruit/Adafruit_NeoPixel/blob/master/Adafruit_NeoPixel.cpp).
