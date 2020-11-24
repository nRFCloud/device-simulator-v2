import { green, yellow, magenta } from 'colors';
import { NrfDevice } from './Device';

export enum DfuStatus {
  downloadFirmware = 'download_firmware',
  applyUpdate = 'apply_update',
  none = 'none',
}

export enum JobExecutionStatus {
  QUEUED = 'QUEUED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  TIMED_OUT = 'TIMED_OUT',
  REJECTED = 'REJECTED',
  REMOVED = 'REMOVED',
  CANCELED = 'CANCELED',
}

export enum JobDocumentOperation {
  app_fw_update = 'app_fw_update',
}

export type JobDocument = {
  operation: JobDocumentOperation;
  fwversion: string;
  size: number;
  location: string;
};

export type JobExecutionState = {
  status: JobExecutionStatus;
  statusDetails: { nextState: DfuStatus };
  versionNumber: number;
};

export type JobExecution = {
  jobId: string;
  status: JobExecutionStatus;
  queuedAt: number;
  lastUpdatedAt: number;
  versionNumber: number;
  executionNumber: number;
  jobDocument: JobDocument;
};

const onJobUpdateAcceptedFactory = async (job: JobExecution, mgr: NrfJobsManager) =>
  async ({
    payload,
  }: {
    payload: {
      timestamp: number;
      executionState: JobExecutionState;
    };
  }) => {
    console.log('handleJobUpdateAccepted', {
      job,
      payload,
    });

    if (payload.executionState.status !== JobExecutionStatus.IN_PROGRESS) {
      return;
    }

    switch (payload.executionState.statusDetails.nextState) {
      case DfuStatus.downloadFirmware:
        console.log(
          magenta(
            `Skipping downloading the firmware from ${yellow(
              job.jobDocument.location,
            )}...`,
          ),
        );
        await mgr.updateJobProgress(
          job,
          payload.executionState.versionNumber,
          DfuStatus.applyUpdate,
        );
        break;
      case DfuStatus.applyUpdate:
        console.log(
          magenta(
            `Skipping applying the firmware update to ${yellow(
              job.jobDocument.fwversion,
            )}...`,
          ),
        );
        await mgr.updateJob(
          job,
          payload.executionState.versionNumber,
          DfuStatus.none,
          JobExecutionStatus.SUCCEEDED,
        );
        // handle next job
        await mgr.device.updateFwVersion(job.jobDocument.fwversion);
        await mgr.waitForJobs();
    }
  };

export class NrfJobsManager {
  public readonly device: NrfDevice;

  constructor(device: NrfDevice) {
    this.device = device;
  }

  async waitForJobs(): Promise<void> {
    const job = await this.waitForNextUpdateJob();
    console.log(job);
    await this.acceptJob(job);
  }

  async waitForNextUpdateJob(): Promise<JobExecution> {
    return new Promise((resolve) => {
      const jobsNextTopic = this.device.topics.jobs.notifyNext;
      this.device.registerListener(jobsNextTopic, ({ payload }: any) => {
        if (!payload.execution) {
          return;
        }

        this.device.unregisterListener(jobsNextTopic);
        resolve(payload.execution as JobExecution);
      });

      return this.device.subscribe(jobsNextTopic);
    });
  }

  async updateJob(
    job: JobExecution,
    expectedVersion: number,
    nextState: DfuStatus,
    status: JobExecutionStatus,
  ): Promise<void> {
    return this.device.publish(this.device.topics.jobs.update(job.jobId)._, {
      status,
      statusDetails: {
        nextState,
      },
      expectedVersion,
      includeJobExecutionState: true,
    });
  }

  async updateJobProgress(
    job: JobExecution,
    expectedVersion: number,
    nextState: DfuStatus,
  ) {
    await this.updateJob(
      job,
      expectedVersion,
      nextState,
      JobExecutionStatus.IN_PROGRESS,
    );

    console.log(
      green(
        `updated job ${yellow(
          job.jobId,
        )} to in progress. nextState: ${nextState}...`,
      ),
    )
  }

  async acceptJob(job: JobExecution) {
    const jobUpdateAcceptedTopic = this.device.topics.jobs.update(job.jobId)
      .accepted;

    await this.device.subscribe(jobUpdateAcceptedTopic);
    await this.device.registerListener(
      jobUpdateAcceptedTopic,
      onJobUpdateAcceptedFactory(job, this),
    );
    await this.updateJobProgress(job, job.versionNumber, DfuStatus.downloadFirmware);
  }
}
