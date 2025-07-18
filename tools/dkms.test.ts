import { compareVersions } from "./dkms.ts";

Deno.test('basic', () => {
  compareVersions({
    'ciallo.ts': 0x0d00,
    'koasayi.ts': 0x0721,
  }, {
    'amashiro.ts': 0x1145,
    'koasayi.ts': 0x2333
  })
})
