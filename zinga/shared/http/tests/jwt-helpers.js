"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.signRs256 = exports.generateRsaKeyPair = exports.signHs256 = exports.nowSeconds = void 0;
const node_crypto_1 = require("node:crypto");
const b64 = (value) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const nowSeconds = () => Math.floor(Date.now() / 1000);
exports.nowSeconds = nowSeconds;
// Hand-rolled HS256 signer so tests can forge tokens (bad iss, missing exp, alg none, ...) independently
// of the plugin under test.
const signHs256 = (payload, secret, header = { alg: 'HS256', typ: 'JWT' }) => {
    const input = `${b64(header)}.${b64(payload)}`;
    return `${input}.${(0, node_crypto_1.createHmac)('sha256', secret).update(input).digest('base64url')}`;
};
exports.signHs256 = signHs256;
const generateRsaKeyPair = () => (0, node_crypto_1.generateKeyPairSync)('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
exports.generateRsaKeyPair = generateRsaKeyPair;
const signRs256 = (payload, privateKeyPem, header = { alg: 'RS256', typ: 'JWT' }) => {
    const input = `${b64(header)}.${b64(payload)}`;
    const signature = (0, node_crypto_1.createSign)('RSA-SHA256').update(input).sign(privateKeyPem).toString('base64url');
    return `${input}.${signature}`;
};
exports.signRs256 = signRs256;
