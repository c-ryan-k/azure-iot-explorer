/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import * as React from 'react';
import { RouteComponentProps } from 'react-router-dom';
import { Label, PrimaryButton } from 'office-ui-fabric-react';
import { LocalizationContextConsumer, LocalizationContextInterface } from '../../../../shared/contexts/localizationContext';
import { CloudToDeviceMessageParameters } from '../../../../api/parameters/deviceParameters';
import '../../../../css/_deviceDetail.scss';
import { getDeviceIdFromQueryString } from '../../../../shared/utils/queryStringHelper';

export interface DeviceStreamProps {
    connectionString: string;
    onInitiateDeviceStream: (parameters: CloudToDeviceMessageParameters) => void;
}

export default class DeviceStream extends React.Component<DeviceStreamProps & RouteComponentProps, {}> {

    constructor(props: DeviceStreamProps & RouteComponentProps) {
        super(props);
    }

    public render(): JSX.Element {
        return (
            <LocalizationContextConsumer>
                {(context: LocalizationContextInterface) => (
                    <>
                      <Label>Press the button below to initiate a device stream.</Label>
                      Note: this allows you to SSH into a local port on your machine and pass that connection through your IoT Hub to your device.
                      Any authentication or authorization for individual users needs to be configured on the device itself, as if you were connecting directly to that device.
                      <br/>
                      {/* tslint:disable-next-line:jsx-no-lambda*/}
                      <PrimaryButton text="Create Local SSH Proxy" onClick={() => this.props.onInitiateDeviceStream({connectionString: this.props.connectionString, deviceId: getDeviceIdFromQueryString(this.props), body: ''})}/>
                    </>
                )}
            </LocalizationContextConsumer>
        );
    }
}
