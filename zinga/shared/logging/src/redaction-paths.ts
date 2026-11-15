// Paths redacted from all log output to prevent secret/key leakage.
export const redactionPaths: string[] = [
  'req.headers.authorization',
  '*.password',
  '*.privateKey',
  '*.private_key',
  '*.seed',
  '*.mnemonic',
  '*.secret',
  '*.jwtSecret',
  '*.rawTx',
  '*.token',
  '*.apiKey',
];
