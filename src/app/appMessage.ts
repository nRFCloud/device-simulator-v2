/* tslint:disable */
/**
 * This file was automatically generated by json-schema-to-typescript.
 * DO NOT MODIFY IT BY HAND. Instead, modify the source JSONSchema file,
 * and run json-schema-to-typescript to regenerate this file.
 */

/**
 * Message format for simulator app
 */

export interface AppMessage {
  appId: 'GPS' | 'FLIP' | 'TEMP' | 'DEVICE' | 'GNSS' | 'RSRP' | 'MCELL' | 'SCELL' | 'WIFI' | 'LOG' | 'ALERT';
  messageType: 'HELLO' | 'START' | 'STOP' | 'INT' | 'GET' | 'STATUS' | 'DATA' | 'OK' | 'EVENT';
  /**
   * This number is incremented by one for each message transmitted
   */
  messageId?: number;
  // Unix timestamp in milliseconds
  ts?: string;
  data?: string | Object;
  [k: string]: any;
}
