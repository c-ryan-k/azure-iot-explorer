/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import * as React from 'react';
import { RouteComponentProps } from 'react-router-dom';
import { Label, PrimaryButton, TextField } from 'office-ui-fabric-react';
import Terminal from 'terminal-in-react';
import { LocalizationContextConsumer, LocalizationContextInterface } from '../../../../shared/contexts/localizationContext';
import { DeviceStreamParameters } from '../../../../api/parameters/deviceParameters';
import '../../../../css/_deviceDetail.scss';
import { getDeviceIdFromQueryString } from '../../../../shared/utils/queryStringHelper';

export interface DeviceStreamProps {
    connectionString: string;
    onInitiateDeviceStream: (parameters: DeviceStreamParameters) => void;
}
interface DeviceStreamState {
    showTerminal: boolean;
    socket: WebSocket;
    username?: string;
    password?: string;
    privateKey?: string;
    lastCommand?: string;
}
export default class DeviceStream extends React.Component<DeviceStreamProps & RouteComponentProps, DeviceStreamState> {
    private ref = React.createRef();
    private processShellCommand = (cmd: string | string[], print: (output: string) => void) => {
       if (cmd instanceof Array)
       {
        this.state.socket.send(cmd.join(' '));
       }
       else {
           this.state.socket.send(cmd);
       }
    }
    private setUserName = (event: React.FormEvent<HTMLTextAreaElement>, newValue?: string) => {
        this.setState({username: newValue});
    }

    private setPrivateKey = (event: React.FormEvent<HTMLTextAreaElement>, newValue?: string) => {
        this.setState({privateKey: newValue});
    }

    constructor(props: DeviceStreamProps & RouteComponentProps) {
        super(props);
        this.state = { showTerminal: false, socket: null };
    }

    private initiateDeviceStream = () => {
        this.setState({ showTerminal: true });
        this.props.onInitiateDeviceStream({ connectionString: this.props.connectionString, deviceId: getDeviceIdFromQueryString(this.props), password: this.state.password || '', user: this.state.username || '', privateKey: this.state.privateKey || ''  });
    }

    private startSSHSocketConnection = () => {
        const socket =  new WebSocket('ws://localhost:2223');
        const reader = new FileReader();
        // tslint:disable-next-line:no-any
        reader.addEventListener('loadend', (e: any) => {
            const text = e.srcElement.result;
            const lastOutput = new TextDecoder('utf-8').decode(text as ArrayBuffer);
            // tslint:disable-next-line:no-console
            console.log(lastOutput);
            this.setState({lastCommand: lastOutput});
          });
        socket.onmessage = (ev: MessageEvent) => {
            reader.readAsArrayBuffer(ev.data);
        };
        this.setState({socket});
    }
    public render(): JSX.Element {
        return (
            <LocalizationContextConsumer>
                {(context: LocalizationContextInterface) => (
                    <>
                        <Label>Press the button below to initiate a device stream.</Label>
                      Note: this allows you to SSH into a local port on your machine and pass that connection through your IoT Hub to your device.
                      Any authentication or authorization for individual users needs to be configured on the device itself, as if you were connecting directly to that device.
                        <br />
                        <TextField label="Username" onChange={this.setUserName}/>
                        <TextField label="PrivateKeyPath" onChange={this.setPrivateKey}/>
                        <PrimaryButton text="Create Local SSH Proxy" onClick={this.initiateDeviceStream} />
                        {this.state.showTerminal && (
                            <div
                            >
                                <PrimaryButton text="Connect" onClick={this.startSSHSocketConnection}/>
                                {this.state.socket && <Terminal
                                    color="green"
                                    backgroundColor="black"
                                    barColor="black"
                                    style={{ fontWeight: 'bold', fontSize: '1em' }}
                                    commands={{

                                    }}
                                    commandPassThrough={this.processShellCommand}
                                    promptSymbol={this.state.lastCommand}
                                    watchConsoleLogging={true}
                                />}
                            </div>
                        )
                        }
                    </>
                )}
            </LocalizationContextConsumer>
        );
    }
}
