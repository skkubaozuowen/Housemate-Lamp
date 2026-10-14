import test from 'node:test';
import assert from 'node:assert/strict';
import { isSameOrigin, listenHost } from '../deployment.js';
test('supports HTTPS through Railway without accepting unrelated origins', () => {
  assert.equal(isSameOrigin('https://housemate.up.railway.app', 'housemate.up.railway.app'), true);
  assert.equal(isSameOrigin('http://localhost:3000', 'localhost:3000'), true);
  assert.equal(isSameOrigin('https://example.com', 'housemate.up.railway.app'), false);
  assert.equal(isSameOrigin('https://housemate.up.railway.app.example.com', 'housemate.up.railway.app'), false);
  assert.equal(isSameOrigin('null', 'housemate.up.railway.app'), false);
});
test('uses the Railway network interface while keeping local default loopback', () => {
  assert.equal(listenHost({PORT:'8080'}), '0.0.0.0');
  assert.equal(listenHost({}), '127.0.0.1');
  assert.equal(listenHost({PORT:'8080',HOST:'127.0.0.1'}), '127.0.0.1');
});
