import { device } from "aws-iot-device-sdk";
import axios from "axios";
import { AxiosInstance } from "axios/index";
import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { Log } from "./models/Log";
import { simulator } from "./simulator";

const cache = require("ez-cache")();
let conn: AxiosInstance;

export const getRestApiConn = (
  apiHost: string,
  apiKey: string,
  verbose: boolean,
): AxiosInstance => {
  if (!conn) {
    // create a connection to the device API
    conn = axios.create({
      baseURL: apiHost,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    conn.interceptors.request.use((config: any) => {
      new Log(!!verbose).debug(config);
      return config;
    });
  }

  return conn;
};

export const generateDeviceId = () => `nrfsim-${Math.floor(Math.random() * 1000000000000000000000)}`;

export type DeviceDefaults = {
  endpoint: string;
  mqttMessagesPrefix: string;
  certsResponse: string;
  teamId: string;
};

export type SimulatorConfig = {
  certsResponse: string;
  endpoint: string;
  appFwVersion: string;
  deviceId: string;
  mqttMessagesPrefix: string;
  stage: string;
  teamId: string;
  appType: string;
  services?: string;
  apiKey?: string;
  apiHost?: string;
  deviceOwnershipCode?: string;
  verbose?: boolean;
  onboard?: string;
  jobExecutionPath?: any;
  mqttTeamDevice: boolean;
  onConnect?: (deviceId: string, client?: device) => Promise<void>;
};

export const associateDevice = ({
  deviceId,
  deviceOwnershipCode,
  apiHost,
  apiKey,
  verbose,
}: Partial<SimulatorConfig>): Promise<void> =>
  getRestApiConn(apiHost as string, apiKey as string, !!verbose).put(
    `/v1/association/${deviceId}`,
    deviceOwnershipCode,
  );

export const onboardDevice = ({
  deviceId,
  certsResponse,
  apiHost,
  apiKey,
  verbose,
}: Partial<SimulatorConfig>) => {
  let certificate = JSON.parse(certsResponse as string).clientCert;
  return getRestApiConn(
    apiHost as string,
    apiKey as string,
    !!verbose,
  ).post(`v1/devices/${deviceId}`, { certificate });
};

export const getDefaults = async ({
  deviceId,
  endpoint,
  mqttMessagesPrefix,
  certsResponse,
  apiHost,
  apiKey,
  deviceOwnershipCode,
  verbose,
  onboard,
}: Partial<SimulatorConfig>): Promise<DeviceDefaults> => {
  const conn = getRestApiConn(apiHost!, apiKey!, !!verbose);
  const log = new Log(!!verbose);

  const defaults: DeviceDefaults = {
    endpoint: endpoint || "",
    mqttMessagesPrefix: mqttMessagesPrefix || "",
    certsResponse: certsResponse || "",
    teamId: "",
  };

  const cacheFile = cache.getFilePath(deviceId);

  const cachedDefaults: DeviceDefaults = cache.exists(cacheFile)
    ? await cache.get(cacheFile)
    : {};

  if (!(endpoint && mqttMessagesPrefix)) {
    log.debug(`Grabbing mqttEndpoint and messagesPrefix...`);
    let defaultEndpoint = cachedDefaults.endpoint || "",
      defaultMqttMessagesPrefix = cachedDefaults.mqttMessagesPrefix || "";

    if (!(defaultEndpoint && defaultMqttMessagesPrefix)) {
      log.debug("Fetching endpoints from device API.\n");
      const { data } = await conn.get(`/v1/account`);
      defaultMqttMessagesPrefix = data.mqttTopicPrefix + "m/";
      defaultEndpoint = data.mqttEndpoint;
    }

    if (!endpoint) {
      defaults.endpoint = defaultEndpoint;
    }

    if (!mqttMessagesPrefix) {
      defaults.mqttMessagesPrefix = defaultMqttMessagesPrefix;
    }
  }

  if (!certsResponse) {
    log.debug("Grabbing cert...");
    let defaultJsonCert = cachedDefaults.certsResponse || "";

    if (!defaultJsonCert) {
      if (onboard === "jitp") {
        log.debug("Fetching cert from device API.\n");
        const { data } = await conn.post(
          `/v1/devices/${deviceId}/certificates`,
          deviceOwnershipCode,
        );

        defaultJsonCert = JSON.stringify(data);
      } else {
        log.debug("Generating self signed device certs.\n");

        const privateKey = execSync(
          `openssl ecparam -name prime256v1 -genkey`,
        ).toString();

        const subject = "/C=NO/ST=Norway/L=Trondheim/O=Nordic Semiconductor/OU=Test Devices";
        const caCert = execSync(
          `echo "${privateKey}" | openssl req -x509 -extensions v3_ca -new -nodes -key /dev/stdin -sha256 -days 1024 -subj "${subject}"`,
        ).toString();

        let privateKey2 = execSync(
          `openssl ecparam -name prime256v1 -genkey`,
        ).toString();
        let deviceCSR = execSync(
          `echo "${privateKey2}" | openssl pkcs8 -topk8 -nocrypt -in /dev/stdin`,
        ).toString();
        deviceCSR = execSync(
          `echo "${deviceCSR}" | openssl req -new -key /dev/stdin -subj "${subject}/CN=${deviceId}"`,
        ).toString();

        const tempDir = os.tmpdir();
        const csrPath = path.join(tempDir, "device.csr");
        const caCertPath = path.join(tempDir, "ca.crt");
        const privateKeyPath = path.join(tempDir, "ca.key");
        const awsCa =
          "-----BEGIN CERTIFICATE-----\nMIIDQTCCAimgAwIBAgITBmyfz5m/jAo54vB4ikPmljZbyjANBgkqhkiG9w0BAQsF\nADA5MQswCQYDVQQGEwJVUzEPMA0GA1UEChMGQW1hem9uMRkwFwYDVQQDExBBbWF6\nb24gUm9vdCBDQSAxMB4XDTE1MDUyNjAwMDAwMFoXDTM4MDExNzAwMDAwMFowOTEL\nMAkGA1UEBhMCVVMxDzANBgNVBAoTBkFtYXpvbjEZMBcGA1UEAxMQQW1hem9uIFJv\nb3QgQ0EgMTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBALJ4gHHKeNXj\nca9HgFB0fW7Y14h29Jlo91ghYPl0hAEvrAIthtOgQ3pOsqTQNroBvo3bSMgHFzZM\n9O6II8c+6zf1tRn4SWiw3te5djgdYZ6k/oI2peVKVuRF4fn9tBb6dNqcmzU5L/qw\nIFAGbHrQgLKm+a/sRxmPUDgH3KKHOVj4utWp+UhnMJbulHheb4mjUcAwhmahRWa6\nVOujw5H5SNz/0egwLX0tdHA114gk957EWW67c4cX8jJGKLhD+rcdqsq08p8kDi1L\n93FcXmn/6pUCyziKrlA4b9v7LWIbxcceVOF34GfID5yHI9Y/QCB/IIDEgEw+OyQm\njgSubJrIqg0CAwEAAaNCMEAwDwYDVR0TAQH/BAUwAwEB/zAOBgNVHQ8BAf8EBAMC\nAYYwHQYDVR0OBBYEFIQYzIU07LwMlJQuCFmcx7IQTgoIMA0GCSqGSIb3DQEBCwUA\nA4IBAQCY8jdaQZChGsV2USggNiMOruYou6r4lK5IpDB/G/wkjUu0yKGX9rbxenDI\nU5PMCCjjmCXPI6T53iHTfIUJrU6adTrCC2qJeHZERxhlbI1Bjjt/msv0tadQ1wUs\nN+gDS63pYaACbvXy8MWy7Vu33PqUXHeeE6V/Uq2V8viTO96LXFvKWlJbYK8U90vv\no/ufQJVtMVT8QtPHRh8jrdkPSHCa2XV4cdFyQzR1bldZwgJcJmApzyMZFo6IQ6XU\n5MsI+yMRQ+hDKXJioaldXgjUkK642M4UwtBV8ob2xJNDd2ZhwLnoQdeXeGADbkpy\nrqXRfboQnoZsG4q5WTP468SQvvG5\n-----END CERTIFICATE-----\n";

        try {
          // Write inputs to temporary files
          fs.writeFileSync(csrPath, deviceCSR);
          fs.writeFileSync(caCertPath, caCert);
          fs.writeFileSync(privateKeyPath, privateKey);
          deviceCSR = execSync(
            `openssl x509 -req -in "${csrPath}" -CA "${caCertPath}" -CAkey "${privateKeyPath}" -CAcreateserial -days 10950 -sha256`,
          ).toString();
        } catch (err) {
          console.error(err);
        } finally {
          fs.unlinkSync(csrPath);
          fs.unlinkSync(caCertPath);
          fs.unlinkSync(privateKeyPath);
        }
        defaultJsonCert = JSON.stringify({
          clientId: deviceId,
          privateKey: privateKey2,
          caCert: awsCa,
          clientCert: deviceCSR,
        });
      }
    }

    defaults.certsResponse = defaultJsonCert;
  }

  let teamId = defaults.mqttMessagesPrefix.split("/")[1];

  if (!teamId) {
    const { data } = await conn.get(`/v1/account`);
    teamId = data.team.teamId;
  }

  if (!teamId) {
    throw new Error(
      `Cannot continue without teamId! defaults: ${JSON.stringify(defaults)}`,
    );
  }

  defaults.teamId = teamId;
  await cache.set(cacheFile, defaults);
  return defaults;
};

export const run = async (config: SimulatorConfig): Promise<void> => {
  const {
    deviceId,
    apiKey,
    apiHost,
    certsResponse,
    endpoint,
    mqttMessagesPrefix,
    deviceOwnershipCode,
    onboard,
    verbose,
  } = config;

  const log = new Log(!!verbose);
  config.deviceId = deviceId || generateDeviceId();

  // grab the defaults from the API
  if (!(apiKey && apiHost)) {
    log.error(
      `ERROR: apiKey: (passed val: "${apiKey}") and apiHost (passed val: "${apiHost}") are required`,
    );
    return;
  }

  const defaults: DeviceDefaults = await getDefaults({
    deviceId: config.deviceId,
    deviceOwnershipCode,
    mqttMessagesPrefix,
    certsResponse,
    endpoint,
    apiHost,
    apiKey,
    verbose,
    onboard,
  });

  config.certsResponse = defaults.certsResponse;
  config.mqttMessagesPrefix = defaults.mqttMessagesPrefix;
  config.endpoint = defaults.endpoint;
  config.teamId = defaults.teamId;

  log.info(
    log.prettify("CONFIG", [
      ["DEVICE ID", config.deviceId],
      ["MQTT TEAM DEVICE", config.mqttTeamDevice.toString()],
      [
        "DEVICE PIN",
        config.deviceOwnershipCode || config.mqttTeamDevice ? "N/A" : "NOT SET",
      ],
      ["API HOST", config.apiHost!],
      ["API KEY", config.apiKey!],
      ["TENANT ID", config.teamId],
      ["STAGE", config.stage],
    ]),
  );

  log.success("starting simulator...");

  if (onboard) {
    config.onConnect = async (deviceId) => {
      log.info(
        `ATTEMPTING TO ONBOARD ${config.deviceId} USING ${onboard} CERTS WITH API KEY ${config.apiKey} VIA ${config.apiHost}`,
      );

      try {
        if (onboard === "jitp") {
          // wait to ensure the device is available in AWS IoT so it can be associated
          await new Promise((resolve) => setTimeout(resolve, 2000));
          await associateDevice({
            deviceId,
            deviceOwnershipCode,
            apiHost,
            apiKey,
            verbose,
          });
        } else {
          await onboardDevice({
            deviceId,
            apiHost,
            apiKey,
            certsResponse: config.certsResponse,
            verbose,
          });
        }

        log.success("DEVICE ONBOARDED!");
      } catch (err) {
        log.error(`Failed to onboard: ${err}`);
      }
    };
  }

  simulator(config).catch((err) => {
    log.error(err);
  });
};
