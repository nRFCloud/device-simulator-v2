import axios, { AxiosInstance } from 'axios';
import { ConnectMode, DeviceCredentials } from './index';
import { Log } from './models/Log';
import { formatCredentialsFilePath, storeDeviceCredentials } from './utils';

export interface DeviceRequestParams {
  deviceId: string;
}

export interface CreateDeviceRequestParams extends DeviceRequestParams {
  connectMode: ConnectMode;
}

export interface OnboardDeviceRequestParams extends DeviceRequestParams {
  certificate: string;
}

interface CredentialsResponse extends DeviceCredentials {
  clientId: string;
}

export type TeamInfo = {
  mqttEndpoint: string;
  mqttMessagesTopicPrefix: string;
  team: {
    tenantId: string;
    name: string;
  };
};

export class RestApiClient {
  private static conn: AxiosInstance;
  private readonly log: Log;

  constructor(private readonly apiHost: string, private readonly apiKey: string, private readonly verbose: boolean) {
    this.log = new Log(verbose);
  }

  private getRestApiConn(): AxiosInstance {
    if (!RestApiClient.conn) {
      RestApiClient.conn = axios.create({
        baseURL: this.apiHost,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      RestApiClient.conn.interceptors.request.use((config: any) => {
        new Log(!!this.verbose).debug(config);
        return config;
      });
    }

    return RestApiClient.conn;
  }

  public async createMqttTeamDevice() {
    let res;
    try {
      res = await this.getRestApiConn().post(
        `v1/devices/mqtt-team`,
      );
      this.log.success(`MQTT Team device successfully created.`);
    } catch (err) {
      this.log.error(`JITP device failed to create. Error: ${err}`);
    }
    const { clientId, ...credentials } = res?.data as CredentialsResponse;
    storeDeviceCredentials(
      formatCredentialsFilePath(clientId, 'onboard'),
      credentials,
      this.log,
    );
    return res?.data as CredentialsResponse;
  }

  // As of Oct 2024 there is no endpoint for creating non-JITP certificates. This is why only the JITP certificate request is offered here.
  // See utils.ts for local generation of non-JITP certificates.
  public async createJitpCertificate({ deviceId, connectMode }: CreateDeviceRequestParams) {
    let res;
    try {
      res = await this.getRestApiConn().post(
        `v1/devices/${deviceId}/certificates`,
        // No need to support custom ownership code as it is not used in the simulator. Just appease the endpoint with a dummy value.
        '123456',
      );
      this.log.success(`JITP certificate for device ${deviceId} successfully created.`);
    } catch (err) {
      this.log.error(`JITP certificate for device ${deviceId} failed to create. Error: ${err}`);
    }
    storeDeviceCredentials(
      formatCredentialsFilePath(deviceId, connectMode),
      res?.data as DeviceCredentials,
      this.log,
    );
    return res?.data as DeviceCredentials;
  }

  public async onboardDevice({ deviceId, certificate }: OnboardDeviceRequestParams) {
    try {
      await this.getRestApiConn().post(`v1/devices/${deviceId}`, {
        certificate,
      });
      this.log.success(`Device ${deviceId} successfully onboarded to nRF Cloud.`);
    } catch (err) {
      this.log.error(`Device ${deviceId} failed to onboard to nRF Cloud. Error: ${err}`);
    }
  }

  public async fetchTeamInfo(): Promise<TeamInfo> {
    const res = await this.getRestApiConn().get(`v1/account`);
    return res.data as TeamInfo;
  }

  public async fetchDevice(deviceId: string) {
    const res = await this.getRestApiConn().get(`v1/devices/${deviceId}`);
    return res.data;
  }

  public async associateDevice({ deviceId }: DeviceRequestParams) {
    try {
      await this.getRestApiConn().put(
        `v1/association/${deviceId}`,
        // No need to support custom ownership code as it is not used in the simulator. Just appease the endpoint with a dummy value.
        '123456',
      );
      this.log.success(`JITP device ${deviceId} successfully associated.`);
    } catch (err) {
      this.log.error(`JITP device ${deviceId} failed to associate. Error: ${err}`);
    }
  }
}
