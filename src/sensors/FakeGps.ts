import { EventEmitter } from 'events';
import { ISensor } from './Sensor';
import * as fs from 'fs';
import * as readline from 'readline';

export class FakeGps extends EventEmitter implements ISensor {
  private readonly nmeaSentences: string[] = [];
  private sentenceIndex: number = 0;
  private reader?: readline.ReadLine;
  private readStream?: fs.ReadStream;
  private started = false;
  private gpsEmitterIntervalId: any = null;

  constructor(
    private readonly nmeaRecording: string,
    private readonly sentenceFilter: Array<string>,
    private readonly loop: boolean = false,
  ) {
    super();
  }

  private readGPSData() {
    this.readStream = fs.createReadStream(this.nmeaRecording);
    this.reader = readline.createInterface({
      input: this.readStream,
    });

    this.reader.on('line', line => {
      const matchesFilter = this.sentenceFilter.some((sentence: string) => {
        return line.startsWith(`\$${sentence}`);
      });
      if (matchesFilter) {
        this.nmeaSentences.push(line);
      }
    });

    this.reader.on('close', () => {
      this.cleanUpAndStartEmitting();
    });
  }

  private emitGPSData() {
    this.emit(
      'data',
      Date.now(),
      new Uint8Array(Buffer.from(this.nmeaSentences[this.sentenceIndex])),
    );

    if (this.sentenceIndex === this.nmeaSentences.length - 1) {
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
    const fileExists = await new Promise(resolve =>
      fs.exists(this.nmeaRecording, resolve),
    );

    if (!fileExists) {
      throw new Error(
        `NMEA recording with filename '${this.nmeaRecording}' does not exist.`,
      );
    }

    this.started = true;

    this.readGPSData();
  }

  private cleanUpAndStartEmitting() {
    if (this.reader) {
      this.reader.close();
    }

    if (this.readStream) {
      this.readStream.close();
    }

    if (this.nmeaSentences) {
      this.gpsEmitterIntervalId = setInterval(() => {
        this.emitGPSData();
      }, 1000);
    }
  }

  stop() {
    clearInterval(this.gpsEmitterIntervalId);
    this.started = false;
    this.emit('stopped');
  }

  isStarted(): boolean {
    return this.started;
  }
}
