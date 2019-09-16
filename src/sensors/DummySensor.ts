import { EventEmitter } from 'events';
import { ISensor } from './Sensor';

export class DummySensor extends EventEmitter implements ISensor {
  private readonly dummyData: Uint8Array;
  private readonly interval: number;
  private tick?: NodeJS.Timer;
  private started: boolean;

  constructor(dummyData: Uint8Array, interval: number) {
    super();
    this.dummyData = dummyData;
    this.interval = interval;
    this.started = false;
  }

  async start(): Promise<void> {
    this.tick = setInterval(() => {
      this.emit('data', Date.now(), this.dummyData);
    }, this.interval);
    this.started = true;
  }

  isStarted(): boolean {
    return this.started;
  }

  private cleanUp() {
    if (this.tick) {
      clearInterval(this.tick);
    }
  }

  async stop(): Promise<void> {
    this.cleanUp();
    this.started = false;
    return;
  }
}
