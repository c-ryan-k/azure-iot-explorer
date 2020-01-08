/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import express = require('express');
import bodyParser = require('body-parser');
import cors = require('cors');
import net = require('net');
import request = require('request');
import { Client as HubClient } from 'azure-iothub';
import { Message as CloudToDeviceMessage } from 'azure-iot-common';
// tslint:disable-next-line:no-submodule-imports
import { StreamInitiation } from 'azure-iothub/lib/interfaces';
import websocket = require('websocket-stream');
import { EventHubClient, EventPosition, delay, EventHubRuntimeInformation, ReceiveHandler } from '@azure/event-hubs';
import { generateDataPlaneRequestBody, generateDataPlaneResponse } from './dataPlaneHelper';

const SERVER_ERROR = 500;
const BAD_REQUEST = 400;
const SUCCESS = 200;
const NOT_FOUND = 400;
const SERVER_PORT = 8081;
const SERVER_WAIT = 3000; // how long we'll let the call for eventHub messages run in non-socket
const app = express();
let client: EventHubClient = null;
const receivers: ReceiveHandler[] = []; // tslint:disable-line: no-any
let connectionString: string = '';
let eventHubClientStopping = false;
let streamProxyRunning = false;

// should not import from app
const IOTHUB_CONNECTION_DEVICE_ID = 'iothub-connection-device-id';
interface Message {
    body: any; // tslint:disable-line:no-any
    enqueuedTime: string;
    properties?: any; // tslint:disable-line:no-any
    systemProperties?: {[key: string]: string};
}

app.use(bodyParser.json());
app.use(cors({
    credentials: true,
    origin: 'http://127.0.0.1:3000',
}));

app.post('/api/DataPlane', (req: express.Request, res: express.Response) => {
    try {
        if (!req.body) {
            res.status(BAD_REQUEST).send();
        }
        else {
            request(
            generateDataPlaneRequestBody(req),
            (err, httpRes, body) => {
                generateDataPlaneResponse(httpRes, body, res);
            });
        }
    }
    catch (error) {
        res.status(SERVER_ERROR).send(error);
    }
});

app.post('/api/CloudToDevice', (req: express.Request, res: express.Response) => {
    try {
        if (!req.body) {
            res.status(BAD_REQUEST).send();
        }
        else {
            const hubClient = HubClient.fromConnectionString(req.body.connectionString);
            hubClient.open(() => {
                const message = new CloudToDeviceMessage(req.body.body);
                addPropertiesToCloudToDeviceMessage(message, req.body.properties);
                hubClient.send(req.body.deviceId, message,  (err, result) => {
                    if (err) {
                        res.status(SERVER_ERROR).send(err);
                    } else {
                        res.status(SUCCESS).send(result);
                    }
                    hubClient.close();
                });
            });
        }
    }
    catch (error) {
        res.status(SERVER_ERROR).send(error);
    }
});

// tslint:disable-next-line:cyclomatic-complexity
const addPropertiesToCloudToDeviceMessage = (message: CloudToDeviceMessage, properties: Array<{key: string, value: string, isSystemProperty: boolean}>) => {
    if (!properties || properties.length === 0) {
        return;
    }
    for (const property of properties) {
        if (property.isSystemProperty) {
            switch (property.key) {
                case 'ack':
                    message.ack = property.value;
                    break;
                case 'contentType':
                    // tslint:disable-next-line:no-any
                    message.contentType = property.value as any;
                    break;
                case 'correlationId':
                    message.correlationId = property.value;
                    break;
                case 'contentEncoding':
                    message.correlationId = property.value;
                    break;
                case 'expiryTimeUtc':
                    // tslint:disable-next-line:radix
                    message.expiryTimeUtc = parseInt(property.value);
                    break;
                case 'messageId':
                    message.messageId = property.value;
                    break;
                case 'lockToken':
                    message.lockToken = property.value;
                    break;
                default:
                    message.properties.add(property.key, property.value);
                    break;
            }
        }
        else {
            message.properties.add(property.key, property.value);
        }
    }
};
app.post('/api/DeviceStreams', (req, res) => {
    try {
        if (!req.body) {
            res.status(BAD_REQUEST).send();
        }
        if (streamProxyRunning) {
            res.status(BAD_REQUEST).send('Device Proxy already running');
        }
        else {
            const hubClient = HubClient.fromConnectionString(req.body.connectionString);
            hubClient.open(() => {
                const streamInit: StreamInitiation = {
                connectTimeoutInSeconds: 30,
                contentEncoding: '',
                contentType: '',
                payload: '',
                responseTimeoutInSeconds: 30,
                streamName: 'TestStream'
                };
                hubClient.initiateStream(req.body.deviceId, streamInit, (
                    // tslint:disable:no-any
                err: any,
                result: any
                ) => {
                if (err) {
                    res.status(SERVER_ERROR).send(err);
                } else {
                    const ws = websocket(result.uri, {
                    headers: {
                        Authorization: 'Bearer ' + result.authorizationToken
                    }
                    });
                    ws.on('close', () => {
                        streamProxyRunning = false;
                    });
                    createLocalWebSocketProxy(ws).then(() => {
                        res.status(SUCCESS).send(JSON.stringify({websocketProxyUri: 'ws://localhost:2222'}));
                    });
                }
                });
            });
        }
    } catch (error) {
        res.status(SERVER_ERROR).send(error);
    }
});
app.post('/api/EventHub/monitor', (req, res) => {
    try {
        if (!req.body) {
            res.status(BAD_REQUEST).send();
        }

        if (!eventHubClientStopping) {
            eventHubProvider(res, req.body).then(result => {
                res.status(SUCCESS).send(result);
            });
        } else {
            res.status(NOT_FOUND).send('Client currently stopping');
        }
    } catch (error) {
        res.status(SERVER_ERROR).send(error);
    }
});

app.post('/api/EventHub/stop', (req, res) => {
    try {
        if (!req.body) {
            res.status(BAD_REQUEST).send();
        }

        eventHubClientStopping = true;
        stopClient().then(() => {
            eventHubClientStopping = false;
            res.status(SUCCESS).send();
        });
    } catch (error) {
        eventHubClientStopping = false;
        res.status(SERVER_ERROR).send(error);
    }
});

app.post('/api/ModelRepo', (req, res) => {
    try {
        if (!req.body) {
            res.status(BAD_REQUEST).send();
        }
        const controllerRequest = req.body;
        request(
        {
            body: controllerRequest.body || null,
            headers: controllerRequest.headers || null,
            method: controllerRequest.method || 'GET',
            uri: controllerRequest.uri
        },
        (err, httpsres, body) => {
            if (!!err) {
                res.status(SERVER_ERROR).send(err);
            } else {
                res.status((httpsres && httpsres.statusCode) || SUCCESS).send((httpsres && httpsres.body) || {}); //tslint:disable-line
            }
        });
    } catch (error) {
        res.status(SERVER_ERROR).send(error);
    }
});

// tslint:disable-next-line: no-any
const eventHubProvider = async (res: any, body: any) =>  {
    try {
        if (!eventHubClientStopping) {
            if (!client || connectionString !== body.connectionString) {
                client = await EventHubClient.createFromIotHubConnectionString(body.connectionString);
                connectionString = body.connectionString;
            }
            const partitionIds = await client.getPartitionIds();

            const hubInfo = await client.getHubRuntimeInformation();

            const startTime = body.startTime ?
                Date.parse(body.startTime) :
                Date.now();

            if (!partitionIds) {
                res.status(NOT_FOUND).send('Nothing to return');
            }

            return handleMessages(body.deviceId, client, hubInfo, partitionIds, startTime, !!body.fetchSystemProperties, body.consumerGroup);
        } else {
            res.status(NOT_FOUND).send('Client currently stopping');
        }
    } catch (error) {
        res.status(SERVER_ERROR).send(error);
    }
}; // tslint:disable-line:cyclomatic-complexity

const stopReceivers = async () => {
    return Promise.all(
        receivers.map(receiver => {
            if (receiver && (receiver.isReceiverOpen === undefined || receiver.isReceiverOpen)) {
                return receiver.stop().catch((err: object) => {
                    console.log(`receivers cleanup error: ${err}`); // tslint:disable-line: no-console
                });
            } else {
                return null;
            }
        })
    );
};

const stopClient = async () => {
    return stopReceivers().then(() => {
        return client && client.close().then(() => {
            client = null;
        }).catch(error => {
            console.log(`client cleanup error: ${error}`); // tslint:disable-line: no-console
            client = null;
        });
    });
};

const handleMessages = async (deviceId: string, eventHubClient: EventHubClient, hubInfo: EventHubRuntimeInformation, partitionIds: string[], startTime: number, fetchSystemProperties: boolean, consumerGroup: string) => {
    const messages: Message[] = []; // tslint:disable-line: no-any
    const onMessage = async (eventData: any) => { // tslint:disable-line: no-any
        if (eventData && eventData.annotations && eventData.annotations[IOTHUB_CONNECTION_DEVICE_ID] === deviceId) {
            const message: Message = {
                body: eventData.body,
                enqueuedTime: eventData.enqueuedTimeUtc,
                properties: eventData.applicationProperties
            };
            if (fetchSystemProperties) {
                message.systemProperties = eventData.annotations;
            }
            messages.push(message);
        }
    };

    partitionIds.forEach(async (partitionId: string) => {
        const receiveOptions =  {
            consumerGroup,
            enableReceiverRuntimeMetric: true,
            eventPosition: EventPosition.fromEnqueuedTime(startTime),
            name: `${hubInfo.path}_${partitionId}`,
        };
        let receiver: ReceiveHandler;
        try {
            receiver = eventHubClient.receive(
                partitionId,
                onMessage,
                (err: object) => {
                    console.log(err); // tslint:disable-line: no-console
                },
                receiveOptions);
            receivers.push(receiver);
            await delay(SERVER_WAIT).then(() => {
                receiver.stop().catch(err => {
                    console.log(`couldn't stop receiver on partition[${partitionId}]: ${err}`); // tslint:disable-line: no-console
                });
            });
        }
        catch (ex) {
            if (receiver) {
                receiver.stop().catch(err => {
                    console.log(`failed to stop receiver: ${err}`); // tslint:disable-line: no-console
                });
            }
            console.log(`receiver fail: ${ex}`); // tslint:disable-line: no-console
        }
    });
    await delay(SERVER_WAIT).then(() => {
        stopReceivers();
    });

    return messages;
};
const createLocalWebSocketProxy = async (ws: websocket.WebSocketDuplex) => {
    const proxyServer = net.createServer(socket => {
        socket.on('end', () => {
          // tslint:disable:no-console
          console.log('client socket disconnected');
        });

        socket.on('error', err => {
          console.error('error on the client socket: ' + err);
        });

        socket.pipe(ws);
        ws.pipe(socket);
        return;
      });
    proxyServer.on('error', err => {
        console.error('error on the proxy server socket: ' + err.toString());
        streamProxyRunning = false;
      });
    proxyServer.listen('2222', () => {
        streamProxyRunning = true;
        console.log('listening on port 2222');
      });
};
app.listen(SERVER_PORT);
