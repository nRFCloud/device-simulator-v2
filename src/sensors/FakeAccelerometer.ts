import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as readline from 'readline';
import { ISensor } from './Sensor';

class WaitDuration {
  private readonly _duration: number;

  constructor(duration: number) {
    this._duration = duration;
  }

  get duration() {
    return this._duration;
  }
}

export class Sample {
  private readonly x: number;
  private readonly y: number;
  private readonly z: number;

  constructor(x: number, y: number, z: number) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  get X() {
    return this.x;
  }

  get Y() {
    return this.y;
  }

  get Z() {
    return this.z;
  }

  toArray(): Array<number> {
    return [this.X, this.Y, this.Z];
  }

  static fromArray(from: Int8Array) {
    return new Sample(from[0], from[1], from[2]);
  }
}

export class FakeAccelerometer extends EventEmitter implements ISensor {
  private readonly movementSensorRecording: string;
  private readonly defaultSampleRate: number;

  private reader?: readline.ReadLine;
  private readStream?: fs.ReadStream;
  private samples: Set<Sample | WaitDuration>;
  private readonly doLoop: boolean;
  private doRun: boolean;

  constructor(
    flipRecording: string,
    doLoop: boolean = true,
    defaultSampleRate: number = 1000,
  ) {
    super();
    this.defaultSampleRate = defaultSampleRate;
    this.movementSensorRecording = flipRecording;
    this.samples = new Set<Sample | WaitDuration>();
    this.doLoop = doLoop;
    this.doRun = false;
  }

  private static parseSample(sample: string): Sample {
    const columns = sample.split(',');
    return new Sample(
      parseInt(columns[0]),
      parseInt(columns[1]),
      parseInt(columns[2]),
    );
  }

  private setupReader() {
    this.readStream = fs.createReadStream(this.movementSensorRecording);
    this.reader = readline.createInterface({
      input: this.readStream,
    });

    this.reader.on('line', line => {
      const columns = line.split(',');

      if (columns.length === 3) {
        // 3-axis accelerometer data
        this.samples = this.samples.add(FakeAccelerometer.parseSample(line));
      } else if (columns.length === 1) {
        // Wait time
        this.samples = this.samples.add(new WaitDuration(parseInt(columns[0])));
      } else {
        console.log(`Unknown sample received: '${line}'.`);
      }
    });

    this.reader.on('close', () => {
      if (this.reader) {
        this.reader.close();
      }

      if (this.readStream) {
        this.readStream.close();
      }

      // Start sending data
      return this.emitSamples();
    });
  }

  private async emitSamples(): Promise<void> {
    do {
      const it = this.samples.entries();
      let done = false;

      while (!done) {
        const next = it.next();

        if (!next.done && this.doRun) {
          const entry = next.value[0];

          if (entry instanceof Sample) {
            this.emit('data', Date.now(), entry.toArray());

            await new Promise<void>(resolve => {
              setTimeout(() => resolve(), this.defaultSampleRate);
            });
          } else if (entry instanceof WaitDuration) {
            await new Promise<void>(resolve => {
              setTimeout(() => resolve(), entry.duration);
            });
          }
        } else {
          done = true;
        }
      }
    } while (this.doRun && this.doLoop);

    this.emit('stopped');
  }

  async start(): Promise<void> {
    this.doRun = true;

    const fileExists = await new Promise(resolve => fs.exists(this.movementSensorRecording, resolve));

    if (!fileExists) {
      throw new Error(
        `Movement sensor recording with filename '${this.movementSensorRecording}' does not exist.`,
      );
    }

    this.setupReader();
  }

  async stop(): Promise<void> {
    this.doRun = false;
  }

  isStarted(): boolean {
    return this.doRun;
  }
}
