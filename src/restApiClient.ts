import axios, { AxiosInstance } from 'axios';
import { SimulatorConfig } from './index';
import { Log } from './models/Log';

export interface RestApiRequestBase {
  apiHost: string;
  apiKey: string;
  verbose?: boolean;
}

export interface RestApiRequestDevice extends RestApiRequestBase {
  deviceId: string;
}

export interface RestApiRequestCertificate extends RestApiRequestDevice {
  certificate: string;
}

export interface CertificateData {
  clientId: string;
  privateKey: string;
  caCert: string;
  clientCert: string;
}

export type TeamInfo = {
  mqttEndpoint: string;
  mqttMessagesPrefix: string;
  teamId: string;
};

export class RestApiClient {
  private static conn: AxiosInstance;
  private log;

  constructor(verbose: boolean) {
    this.log = new Log(verbose);
  }

  getRestApiConn(apiHost: string, apiKey: string, verbose: boolean): AxiosInstance {
    if (!RestApiClient.conn) {
      RestApiClient.conn = axios.create({
        baseURL: apiHost,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      RestApiClient.conn.interceptors.request.use((config: any) => {
        new Log(!!verbose).debug(config);
        return config;
      });
    }

    return RestApiClient.conn;
  }

  public async createMqttTeamDevice({ apiHost, apiKey, verbose }: RestApiRequestBase): Promise<CertificateData> {
    const { data } = await this.getRestApiConn(apiHost as string, apiKey as string, !!verbose).post(
      `v1/devices/mqtt-team`,
    );
    return data as CertificateData;
  }

  public async getMqttTeamDevice({ deviceId, apiHost, apiKey, verbose }: RestApiRequestDevice) {
    return this.getRestApiConn(apiHost as string, apiKey as string, !!verbose).get(`v1/devices/mqtt-team/${deviceId}`);
  }

  public async onboardDevice({ deviceId, certificate, apiHost, apiKey, verbose }: RestApiRequestCertificate) {
    try {
      await this.getRestApiConn(apiHost as string, apiKey as string, !!verbose).post(`v1/devices/${deviceId}`, {
        certificate,
      });
      this.log.success(`Device ${deviceId} successfully onboarded to nRF Cloud.`);
    } catch (err) {
      this.log.error(`Device ${deviceId} failed to onboard to nRF Cloud. Error: ${err}`);
    }
  }

  public async fetchTeamInfo({ apiHost, apiKey, verbose }: Partial<SimulatorConfig>): Promise<TeamInfo> {
    return this.getRestApiConn(apiHost as string, apiKey as string, !!verbose).get(`v1/account`);
  }
}
