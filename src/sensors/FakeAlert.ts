import { EventEmitter } from 'events';
import * as fs from 'fs';
import { ISensor } from './Sensor';

export class FakeAlert extends EventEmitter implements ISensor {
  private readonly alertSentences: Object[] = [];
  private sentenceIndex: number = 0;
  private started = false;
  private alertEmitterIntervalId: any = null;

  constructor(
    private readonly alertReading: string,
    private readonly loop: boolean = false,
    private readonly defaultSampleRate: number,
  ) {
    super();
  }

  private readAlertData() {
    const data = require(this.alertReading);
    this.alertSentences.push(...data);
    this.cleanUpAndStartEmitting();
  }

  private emitAlertData() {
    this.emit(
      'data',
      Date.now(),
      this.alertSentences[this.sentenceIndex],
    );

    if (this.sentenceIndex === this.alertSentences.length - 1) {
      if (this.loop) {
        this.sentenceIndex = 0;
      } else {
        this.stop();
      }
    } else {
      this.sentenceIndex++;
    }
  }

  async start(): Promise<void> {
    const fileExists = await new Promise(resolve => fs.exists(this.alertReading, resolve));

    if (!fileExists) {
      throw new Error(
        `Recording with filename '${this.alertReading}' does not exist.`,
      );
    }

    this.started = true;

    this.readAlertData();
  }

  private cleanUpAndStartEmitting() {
    if (this.alertSentences) {
      this.alertEmitterIntervalId = setInterval(() => {
        this.emitAlertData();
      }, this.defaultSampleRate);
    }
  }

  stop() {
    clearInterval(this.alertEmitterIntervalId);
    this.started = false;
    this.emit('stopped');
  }

  isStarted(): boolean {
    return this.started;
  }
}
