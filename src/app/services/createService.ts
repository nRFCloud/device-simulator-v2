import { ISensor } from '../../sensors/Sensor';
import { SendMessage } from '../../nrfDevice';
import { Service } from './Service';
import { Gps } from './Gps';
import { Temp } from './Temperature';
import { Flip } from './Flip';
import { Device } from './Device';

interface ServiceConstructors {
  [index: string]: new (sensor: ISensor, sendMessage: SendMessage) => Service;
}

const services: ServiceConstructors = {
  acc: Flip,
  gps: Gps,
  temp: Temp,
  device: Device,
};

export const createService = (
  name: string,
  sensor: ISensor,
  sendMessage: SendMessage,
): Service => {
  const Service = services[name];
  if (Service == null) {
    throw new Error(`No service for a sensor named '${name}' is known.`);
  }

  return new Service(sensor, sendMessage);
};
