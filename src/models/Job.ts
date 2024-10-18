import { $enum } from 'ts-enum-util';

import { NrfDevice } from './Device';
import { Logger } from './Log';

enum FirmwareType {
  APP = 0,
  MODEM = 1,
  BOOT = 2,
}

// enum JobStatus {
//   IN_PROGRESS = 0,
//   CANCELED = 1,
//   DELETION_IN_PROGRESS = 2,
//   COMPLETED = 3,
// }

enum JobExecutionStatus {
  QUEUED = 0,
  IN_PROGRESS = 1,
  FAILED = 2,
  SUCCEEDED = 3,
  TIMED_OUT = 4,
  CANCELED = 5,
  REJECTED = 6,
  DOWNLOADING = 7,
}

export enum JobExecutionFailureScenario {
  Ignore = 0,
  Reject = 1,
  DownloadHang = 2,
  DownloadInProgressHang = 3,
  DownloadTimeout = 4,
  DownloadFailed = 5,
}

const getExecutionPath = (scenario: JobExecutionFailureScenario): JobExecutionStatus[] => {
  return $enum.mapValue(scenario).with({
    [JobExecutionFailureScenario.Ignore]: [JobExecutionStatus.QUEUED],
    [JobExecutionFailureScenario.Reject]: [JobExecutionStatus.QUEUED, JobExecutionStatus.REJECTED],
    [JobExecutionFailureScenario.DownloadHang]: [JobExecutionStatus.QUEUED, JobExecutionStatus.DOWNLOADING],
    [JobExecutionFailureScenario.DownloadInProgressHang]: [
      JobExecutionStatus.QUEUED,
      JobExecutionStatus.DOWNLOADING,
      JobExecutionStatus.IN_PROGRESS,
    ],
    [JobExecutionFailureScenario.DownloadTimeout]: [
      JobExecutionStatus.QUEUED,
      JobExecutionStatus.DOWNLOADING,
      JobExecutionStatus.IN_PROGRESS,
      JobExecutionStatus.TIMED_OUT,
    ],
    [JobExecutionFailureScenario.DownloadFailed]: [
      JobExecutionStatus.QUEUED,
      JobExecutionStatus.DOWNLOADING,
      JobExecutionStatus.IN_PROGRESS,
      JobExecutionStatus.FAILED,
    ],
  });
};

const getPathName = (scenario: JobExecutionFailureScenario): string => {
  return $enum.mapValue(scenario).with({
    [JobExecutionFailureScenario.Ignore]: 'Ignore Job',
    [JobExecutionFailureScenario.Reject]: 'Reject Job',
    [JobExecutionFailureScenario.DownloadHang]: 'Hang on DOWNLOADING state',
    [JobExecutionFailureScenario.DownloadInProgressHang]: 'Hang on IN_PROGRESS state',
    [JobExecutionFailureScenario.DownloadTimeout]: 'End with a TIME_OUT',
    [JobExecutionFailureScenario.DownloadFailed]: 'End by FAILING',
    [$enum.handleUnexpected]: `Unexpected failure scenario: ${scenario}`,
  });
};

const getNextExecutionStatus = (
  scenarioType: JobExecutionFailureScenario,
  currentStatus: JobExecutionStatus,
): JobExecutionStatus => {
  const scenario = getExecutionPath(scenarioType);
  const currentStep = scenario.indexOf(currentStatus);

  if (currentStep === -1) {
    return scenario[0];
  }

  return scenario[currentStep + 1] ?? '';
};

type JobId = string;
type FileSize = number;
type Host = string;
type Path = string;

export type Job = [JobId, FirmwareType, FileSize, Host, Path];

export class NrfJobsManager {
  private readonly log: Logger;
  public readonly device: NrfDevice;
  private readonly cache: { [jobId: string]: JobExecutionStatus } = {};
  private readonly scenario: any;
  private didSendInitialJobRequest: boolean = false;

  constructor(device: NrfDevice, log: Logger, scenario: any) {
    this.device = device;
    this.log = log;
    this.scenario = scenario;
  }

  async waitForJobs(): Promise<void> {
    await this.requestLatestQueuedJob();
    await this.setupJobsListener();
  }

  async requestLatestQueuedJob(): Promise<void> {
    if (this.didSendInitialJobRequest) {
      this.log.debug('Already sent initial job request. Not sending another...');
      return;
    }

    await this.device.publish(this.device.topics.jobs.request, ['']);
    this.didSendInitialJobRequest = true;
  }

  async setupJobsListener(): Promise<void> {
    this.device.registerListener(
      this.device.topics.jobs.receive,
      async ({ payload }: { payload: Job }) => {
        if (!payload) {
          return;
        }

        const [jobId, firmwareType, , host, scenario]: [
          JobId,
          FirmwareType,
          FileSize,
          Host,
          Path,
        ] = payload;

        const prevStatus: JobExecutionStatus = this.cache[jobId] || JobExecutionStatus.QUEUED;
        let newStatus: JobExecutionStatus | undefined = undefined;
        let message: string | undefined = undefined;

        const firmwareTypes: { [key: number]: string } = {};
        $enum(FirmwareType).getEntries().forEach(([key, val]) => firmwareTypes[val] = key);

        const jobExecutionStatuses: { [key: number]: string } = {};
        $enum(JobExecutionStatus).getEntries().forEach(([key, val]) => jobExecutionStatuses[val] = key);

        switch (prevStatus) {
          case JobExecutionStatus.QUEUED:
            message = `downloading "${firmwareTypes[firmwareType]}" firmware file from "${host}${scenario}"`;
            newStatus = this.scenario
              ? getNextExecutionStatus(this.scenario, prevStatus)
              : JobExecutionStatus.DOWNLOADING;
            break;

          case JobExecutionStatus.DOWNLOADING:
            message = `installing "${firmwareTypes[firmwareType]}" firmware file from "${host}${scenario}"`;
            newStatus = this.scenario
              ? getNextExecutionStatus(this.scenario, prevStatus)
              : JobExecutionStatus.IN_PROGRESS;
            break;

          case JobExecutionStatus.IN_PROGRESS:
            message = `installation successful for "${
              firmwareTypes[firmwareType]
            }" firmware file from "${host}${scenario}"`;
            newStatus = this.scenario
              ? getNextExecutionStatus(this.scenario, prevStatus)
              : JobExecutionStatus.SUCCEEDED;
            break;

          case JobExecutionStatus.SUCCEEDED:
            this.log.success(`job "${jobId}" succeeded!`);
            break;

          case JobExecutionStatus.CANCELED:
            this.log.error(`ERROR: job "${jobId}" was cancelled.`);
            break;

          case JobExecutionStatus.TIMED_OUT:
            this.log.error(`ERROR: job "${jobId}" was timed out.`);
            break;

          case JobExecutionStatus.REJECTED:
            this.log.error(`ERROR: job "${jobId}" was rejected.`);
            break;

          case JobExecutionStatus.FAILED:
            this.log.error(`ERROR: job "${jobId} was failed`);
            break;
        }

        if (newStatus) {
          this.log.info('Requesting job execution updates...');
          await this.device.publish(this.device.topics.jobs.request, [jobId]);

          this.log.info(`Updating job execution status to "${newStatus}" for jobId "${jobId}"...`);
          await this.updateJobExecution(jobId, newStatus);
          this.cache[jobId] = newStatus;
        }

        if (message) {
          this.log.info(this.log.prettify(this.device.id, [
            ['JOB ID', jobId],
            ['OLD STATUS', `${jobExecutionStatuses[prevStatus]} (${prevStatus})`],
            ['NEW STATUS', `${newStatus ? jobExecutionStatuses[newStatus] : ''} (${newStatus ?? ''})`],
            ['MESSAGE', message],
            ['JOB EXECUTION FAILURE SCENARIO', getPathName(this.scenario)],
          ]));
        }
      },
    );

    await this.device.subscribe(this.device.topics.jobs.receive);
  }

  async updateJobExecution(
    id: JobId,
    status: JobExecutionStatus,
    message: string = '',
  ): Promise<void> {
    return this.device.publish(this.device.topics.jobs.update, [
      id,
      status,
      message,
    ]);
  }
}
