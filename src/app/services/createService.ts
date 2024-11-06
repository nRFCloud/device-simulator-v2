import { SendMessage } from '../../nrfDevice';
import { ISensor } from '../../sensors/Sensor';
import { Alert } from './Alert';
import { Device } from './Device';
import { Flip } from './Flip';
import { Gnss } from './Gnss';
import { Gps } from './Gps';
import { Location } from './Location';
import { Log } from './Log';
import { Rsrp } from './Rsrp';
import { Service } from './Service';
import { Temp } from './Temperature';

interface ServiceConstructors {
  [index: string]: new(sensor: ISensor, sendMessage: SendMessage) => Service;
}

const services: ServiceConstructors = {
  acc: Flip,
  gps: Gps,
  gnss: Gnss,
  temp: Temp,
  device: Device,
  rsrp: Rsrp,
  location: Location,
  alert: Alert,
  log: Log,
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
