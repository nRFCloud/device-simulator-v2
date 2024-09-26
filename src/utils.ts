import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SimulatorConfig } from './index';
import { Log } from './models/Log';
import { CertificateData } from './restApiClient';

export const generateDeviceId = () => `nrfsim-${Math.floor(Math.random() * 1000000000000000000000)}`;

export const createSelfSignedDeviceCertificate = ({
  deviceId,
  verbose,
}: Partial<SimulatorConfig>): CertificateData => {
  const log = new Log(!!verbose);
  log.debug('Generating self-signed device certificates.\n');
  const certs: CertificateData = {} as CertificateData;

  certs.privateKey = execSync(
    `openssl ecparam -name prime256v1 -genkey`,
  ).toString();

  const subject = '/C=NO/ST=Norway/L=Trondheim/O=Nordic Semiconductor/OU=Test Devices';

  certs.caCert = execSync(
    `echo "${certs.privateKey}" | openssl req -x509 -extensions v3_ca -new -nodes -key /dev/stdin -sha256 -days 1024 -subj "${subject}"`,
  ).toString();

  const csrPrivateKey = execSync(
    `openssl ecparam -name prime256v1 -genkey`,
  ).toString();
  let deviceCSR = execSync(
    `echo "${csrPrivateKey}" | openssl pkcs8 -topk8 -nocrypt -in /dev/stdin`,
  ).toString();
  deviceCSR = execSync(
    `echo "${deviceCSR}" | openssl req -new -key /dev/stdin -subj "${subject}/CN=${deviceId}"`,
  ).toString();

  const tempDir = os.tmpdir();
  const csrPath = path.join(tempDir, 'device.csr');
  const caCertPath = path.join(tempDir, 'ca.crt');
  const privateKeyPath = path.join(tempDir, 'ca.key');

  try {
    // Write secrets to temporary files
    fs.writeFileSync(csrPath, deviceCSR);
    fs.writeFileSync(caCertPath, certs.caCert);
    fs.writeFileSync(privateKeyPath, certs.privateKey);
    certs.clientCert = execSync(
      `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${privateKeyPath}" -CAcreateserial -days 10950 -sha256`,
    ).toString();
  } catch (err) {
    log.error(err as string);
  } finally {
    fs.unlinkSync(csrPath);
    fs.unlinkSync(caCertPath);
    fs.unlinkSync(privateKeyPath);
  }
  return certs;
};
