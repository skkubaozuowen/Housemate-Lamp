// Railway terminates HTTPS at its proxy, while Node receives HTTP internally.
export function isSameOrigin(origin, host) {
  if (!origin) return true;
  return origin === `http://${host}` || origin === `https://${host}`;
}
export function listenHost(env) {
  return env.HOST || (env.PORT ? '0.0.0.0' : '127.0.0.1');
}
