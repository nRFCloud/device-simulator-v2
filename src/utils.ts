import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { DeviceCredentials, SimulatorConfig } from './index';
import { Log } from './models/Log';

export const generateDeviceId = () => `nrfsim-${Math.floor(Math.random() * 1000000000000000000000)}`;

const getCredentialsDirPath = () => {
  const credentialsDir = path.join(__dirname, '..', 'credentials');
  if (!fs.existsSync(credentialsDir)) {
    fs.mkdirSync(credentialsDir);
  }
  return credentialsDir;
};
export const formatCredentialsFilePath = (deviceId: string) => path.join(getCredentialsDirPath(), `${deviceId}.json`);

export const createSelfSignedDeviceCertificate = ({
  deviceId,
  verbose,
}: Partial<SimulatorConfig>) => {
  const log = new Log(!!verbose);
  const credentials: DeviceCredentials = {} as DeviceCredentials;

  const caKey = execSync(
    `openssl ecparam -name prime256v1 -genkey`,
  ).toString();

  const subject = '/C=NO/ST=Norway/L=Trondheim/O=Nordic Semiconductor/OU=Test Devices';

  credentials.caCert = execSync(
    `echo "${caKey}" | openssl req -x509 -extensions v3_ca -new -nodes -key /dev/stdin -sha256 -days 1024 -subj "${subject}"`,
  ).toString();

  credentials.privateKey = execSync(
    `openssl ecparam -name prime256v1 -genkey`,
  ).toString();
  let deviceCSR = execSync(
    `echo "${credentials.privateKey}" | openssl pkcs8 -topk8 -nocrypt -in /dev/stdin`,
  ).toString();
  deviceCSR = execSync(
    `echo "${deviceCSR}" | openssl req -new -key /dev/stdin -subj "${subject}/CN=${deviceId}"`,
  ).toString();

  const tempDir = os.tmpdir();
  const csrPath = path.join(tempDir, 'device.csr');
  const caCertPath = path.join(tempDir, 'ca.crt');
  const privateKeyPath = path.join(tempDir, 'ca.key');
  const credentialsFilePath = formatCredentialsFilePath(deviceId!);

  try {
    // Write temp files used to generate client cert.
    fs.writeFileSync(csrPath, deviceCSR);
    fs.writeFileSync(caCertPath, credentials.caCert);
    fs.writeFileSync(privateKeyPath, caKey);
    credentials.clientCert = execSync(
      `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${privateKeyPath}" -CAcreateserial -days 10950 -sha256`,
    ).toString();

    // What follows is the CA cert for MTLS, i.e., for the device to authenticate connections with the AWS IoT Core MQTT broker. This CA cert
    // should not be confused with the CA cert created above, which was used with the CSR to generate the device's certificate.
    //
    // As of Oct 2024 the nRF Cloud REST API returns the RSA-based Amazon CA Cert 1 in the JSON response. This is fine because certificates provided
    // by our API are only used for Nordic Semiconductor products used in R&D, testing, etc., like the Thingys and DKs, which are not power constrained.
    // Just know that certificates incur a significant memory cost for power-constrained devices. Using an ECC-based certificate can save between 4kb and
    // 12kB of memory, which on small devices is significant. In this simulator we use the ECC-based Amazon CA cert 3
    // (https://www.amazontrust.com/repository/AmazonRootCA3.pem) for self-signed certificates in order to demonstrate use of both.
    credentials.caCert = '-----BEGIN CERTIFICATE-----\n'
      + 'MIIBtjCCAVugAwIBAgITBmyf1XSXNmY/Owua2eiedgPySjAKBggqhkjOPQQDAjA5\n'
      + 'MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6b24g\n'
      + 'Um9vdCBDQSAzMB4XDTE1MDUyNjAwMDAwMFoXDTQwMDUyNjAwMDAwMFowOTELMAkG\n'
      + 'A1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJvb3Qg\n'
      + 'Q0EgMzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABCmXp8ZBf8ANm+gBG1bG8lKl\n'
      + 'ui2yEujSLtf6ycXYqm0fc4E7O5hrOXwzpcVOho6AF2hiRVd9RFgdszflZwjrZt6j\n'
      + 'QjBAMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgGGMB0GA1UdDgQWBBSr\n'
      + 'ttvXBp43rDCGB5Fwx5zEGbF4wDAKBggqhkjOPQQDAgNJADBGAiEA4IWSoxe3jfkr\n'
      + 'BqWTrBqYaGFy+uGh0PsceGCmQ5nFuMQCIQCcAu/xlJyzlvnrxir4tiz+OpAUFteM\n'
      + 'YyRIHN8wfdVoOw==\n'
      + '-----END CERTIFICATE-----\n';

    credentials.caCert =
      '-----BEGIN CERTIFICATE-----\nMIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\nADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\nb24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\nMAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\nb3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\nca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\nIFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\nVOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\njgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\nAYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\nA4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\nU5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\nN+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\no/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\nrqXRfboQnoZsG4q5WTP468SQvvG5\n-----END CERTIFICATE-----\n';

    // Write composite of all credentials as JSON file with line breaks replaced.
    credentials.clientCert.replace(/\n/g, '\n');
    caKey.replace(/\n/g, '\n');
    log.debug(JSON.stringify(credentials, null, 2));
    fs.writeFileSync(credentialsFilePath, JSON.stringify(credentials, null, 2));
    storeDeviceCredentials(credentialsFilePath, credentials, log);
  } catch (err) {
    log.error(err as string);
  } finally {
    fs.unlinkSync(csrPath);
    fs.unlinkSync(caCertPath);
    fs.unlinkSync(privateKeyPath);
  }
  return credentials;
};

export const storeDeviceCredentials = (filePath: string, credentials: DeviceCredentials, log: Log) => {
  fs.writeFileSync(filePath, JSON.stringify(credentials, null, 2));
  log.info(`\nDevice certificates saved to ${filePath}`);
};

export const getLocallyStoredDeviceCredentials = (deviceId: string, log: Log) => {
  const credentialsFilePath = formatCredentialsFilePath(deviceId);
  if (!fs.existsSync(credentialsFilePath)) {
    throw new Error(
      `You set device id ${deviceId} but credentials could not be found at their expected location: ${
        formatCredentialsFilePath(deviceId)
      }. If you lost the credentials, simply unset the device id and new credentials will be generated for you.`,
    );
  }
  log.success(`\nUsing locally stored device credentials for ${deviceId}.`);
  return JSON.parse(fs.readFileSync(credentialsFilePath, 'utf8')) as DeviceCredentials;
};

export const timeoutAsync = promisify((ms: number, cb: (err: unknown) => void) => setTimeout(cb, ms));

export function calculateExponentialBackoff(attempt: number, base: number, max: number) {
  const delay = Math.min(base * 2 ** attempt, max);
  return delay / 2 + Math.random() * delay / 2;
}

/**
 * Retries the given function using a backoff algorithm.
 * It times out after 27750ms
 */
export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetryAttempts = 5,
  base = 1000,
  max = 30000,
): Promise<Awaited<T>> {
  let attempted = 0;
  while (maxRetryAttempts--) {
    try {
      return await fn();
    } catch (error) {
      if (maxRetryAttempts === 0) {
        throw error;
      }
      const delay = calculateExponentialBackoff(attempted++, base, max);
      await timeoutAsync(delay);
    }
  }
  throw new Error('Unreachable');
}
