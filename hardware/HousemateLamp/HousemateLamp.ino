#include <Adafruit_NeoPixel.h>

// Keep this cap conservative until the separate 5 V supply is identified.
#ifndef HOUSEMATE_MAX_BRIGHTNESS
#define HOUSEMATE_MAX_BRIGHTNESS 3
#endif
#if HOUSEMATE_MAX_BRIGHTNESS < 0 || HOUSEMATE_MAX_BRIGHTNESS > 255
#error "HOUSEMATE_MAX_BRIGHTNESS must be between 0 and 255."
#endif

namespace {
const uint16_t LED_COUNT = 256;
const uint8_t LED_PIN = 6;
const uint8_t MAX_BRIGHTNESS = HOUSEMATE_MAX_BRIGHTNESS;
const uint16_t FRAME_LENGTH = 1 + LED_COUNT * 3;
const unsigned long INTERBYTE_TIMEOUT_MS = 250;
const unsigned long WATCHDOG_MS = 4000;
const char MAGIC[] = "HML1";

Adafruit_NeoPixel pixels(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
enum ParseState : uint8_t { FIND_MAGIC, READ_HEADER, READ_PAYLOAD, READ_CRC_LOW, READ_CRC_HIGH };
ParseState state = FIND_MAGIC;
uint8_t magicIndex = 0;
uint8_t headerIndex = 0;
uint8_t command = 0;
uint8_t sequence = 0;
bool hasSequence = false;
uint16_t length = 0;
uint16_t payloadIndex = 0;
uint16_t crc = 0xFFFF;
uint16_t receivedCrc = 0;
uint8_t frameBrightness = 0;
uint8_t rgb[3] = {0, 0, 0};
unsigned long lastByteAt = 0;
unsigned long lastValidCommandAt = 0;
bool watchdogExpired = false;
bool stripReady = false;

uint16_t crc16(uint16_t value, uint8_t byte) {
  value ^= static_cast<uint16_t>(byte) << 8;
  for (uint8_t bit = 0; bit < 8; ++bit) {
    value = (value & 0x8000) ? static_cast<uint16_t>((value << 1) ^ 0x1021)
                             : static_cast<uint16_t>(value << 1);
  }
  return value;
}

void resetParser() {
  state = FIND_MAGIC;
  magicIndex = 0;
  headerIndex = 0;
  hasSequence = false;
  length = 0;
  payloadIndex = 0;
  crc = 0xFFFF;
  receivedCrc = 0;
}

void ready() {
  Serial.print(F("HML READY 1 256 6 "));
  Serial.println(MAX_BRIGHTNESS);
}

void ack() {
  Serial.print(F("ACK "));
  Serial.println(sequence);
}

void nak(const __FlashStringHelper *reason) {
  if (!hasSequence) return;
  Serial.print(F("NAK "));
  Serial.print(sequence);
  Serial.print(' ');
  Serial.println(reason);
}

void off() {
  pixels.clear();
  pixels.show();
}

uint8_t channel(uint8_t raw) {
  // Scale once while receiving: setBrightness() would rescale the buffer and
  // cannot recover its colors when the preceding frame had brightness zero.
  const uint16_t corrected = Adafruit_NeoPixel::gamma8(raw);
  return static_cast<uint8_t>((corrected * frameBrightness + 127) / 255);
}

bool validHeader() {
  if (command != 'F' && command != 'P' && command != 'O' && command != 'H') {
    nak(F("command"));
    return false;
  }
  if ((command == 'F' && length != FRAME_LENGTH) || (command != 'F' && length != 0)) {
    nak(F("length"));
    return false;
  }
  return true;
}

void finishPacket() {
  if (receivedCrc != crc) {
    nak(F("crc"));
    resetParser();
    return;
  }
  if (command == 'F') pixels.show();
  else if (command == 'O') off();
  else if (command == 'H') ready();
  // NeoPixel output briefly disables interrupts on AVR. The sender must wait
  // for this ACK before sending any next packet, including P or O.
  lastValidCommandAt = millis();
  watchdogExpired = false;
  ack();
  resetParser();
}

void consume(uint8_t byte) {
  lastByteAt = millis();
  if (state == FIND_MAGIC) {
    if (byte == static_cast<uint8_t>(MAGIC[magicIndex])) ++magicIndex;
    else magicIndex = (byte == static_cast<uint8_t>(MAGIC[0])) ? 1 : 0;
    if (magicIndex == 4) {
      state = READ_HEADER;
      magicIndex = 0;
      headerIndex = 0;
      crc = 0xFFFF;
    }
    return;
  }
  if (state == READ_HEADER) {
    crc = crc16(crc, byte);
    if (headerIndex == 0) command = byte;
    else if (headerIndex == 1) { sequence = byte; hasSequence = true; }
    else if (headerIndex == 2) length = byte;
    else length |= static_cast<uint16_t>(byte) << 8;
    ++headerIndex;
    if (headerIndex == 4) {
      if (!validHeader()) { resetParser(); return; }
      payloadIndex = 0;
      state = length ? READ_PAYLOAD : READ_CRC_LOW;
    }
    return;
  }
  if (state == READ_PAYLOAD) {
    // Payload bytes, including HML1, never enter the magic scanner. Only one
    // 768-byte NeoPixel buffer exists; nothing is displayed until CRC passes.
    crc = crc16(crc, byte);
    if (payloadIndex == 0) frameBrightness = byte > MAX_BRIGHTNESS ? MAX_BRIGHTNESS : byte;
    else {
      const uint8_t component = (payloadIndex - 1) % 3;
      rgb[component] = channel(byte);
      if (component == 2) pixels.setPixelColor((payloadIndex - 1) / 3, rgb[0], rgb[1], rgb[2]);
    }
    ++payloadIndex;
    if (payloadIndex == length) state = READ_CRC_LOW;
    return;
  }
  if (state == READ_CRC_LOW) {
    receivedCrc = byte;
    state = READ_CRC_HIGH;
    return;
  }
  receivedCrc |= static_cast<uint16_t>(byte) << 8;
  finishPacket();
}
}  // namespace

void setup() {
  Serial.begin(115200);
  pixels.begin();
  if (!pixels.getPixels()) {
    Serial.println(F("HML ERROR memory"));
    return;
  }
  stripReady = true;
  off();
  lastValidCommandAt = millis();
  ready();
}

void loop() {
  if (!stripReady) return;
  if ((state != FIND_MAGIC || magicIndex != 0) && millis() - lastByteAt >= INTERBYTE_TIMEOUT_MS) {
    nak(F("timeout"));
    resetParser();
  }
  while (Serial.available() > 0) consume(static_cast<uint8_t>(Serial.read()));
  if (!watchdogExpired && millis() - lastValidCommandAt >= WATCHDOG_MS) {
    // Clearing the shared pixel buffer invalidates any frame being received.
    // Do not let its remaining bytes later display a partially cleared image.
    if (state != FIND_MAGIC) nak(F("timeout"));
    resetParser();
    off();
    watchdogExpired = true;
  }
}
