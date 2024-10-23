import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as readline from 'readline';
import { ISensor } from './Sensor';

export class FakeRsrp extends EventEmitter implements ISensor {
  private readonly samples: string[] = [];
  private doRun = false;

  constructor(
    private readonly sensorRecording: string,
    private readonly doLoop: boolean,
    private readonly sampleRate: number,
  ) {
    super();
  }

  private setupReader() {
    const input = fs.createReadStream(this.sensorRecording);
    const reader = readline.createInterface({ input });

    reader.on('line', line => {
      this.samples.push(line);
    });

    reader.on('close', () => {
      if (reader) {
        reader.close();
      }

      if (input) {
        input.close();
      }

      // Start sending data
      return this.emitSamples();
    });
  }

  private async emitSamples(): Promise<void> {
    do {
      for (const sample of this.samples) {
        if (!this.doRun) {
          return;
        }

        this.emit('data', Date.now(), new Uint8Array(Buffer.from(sample)));

        await new Promise<void>(resolve => {
          setTimeout(() => resolve(), this.sampleRate);
        });
      }
    } while (this.doRun && this.doLoop);

    this.emit('stopped');
  }

  async start(): Promise<void> {
    if (!fs.existsSync(this.sensorRecording)) {
      throw new Error(
        `Sensor recording with filename '${this.sensorRecording}' does not exist.`,
      );
    }

    this.doRun = true;
    this.setupReader();
  }

  stop() {
    this.doRun = false;
  }

  isStarted(): boolean {
    return this.doRun;
  }
}
