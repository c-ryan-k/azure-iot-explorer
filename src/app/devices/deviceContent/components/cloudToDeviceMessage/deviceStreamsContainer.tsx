/***********************************************************
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License
 **********************************************************/
import { compose, Dispatch } from 'redux';
import { withRouter } from 'react-router-dom';
import { connect } from 'react-redux';
import DeviceStream, { DeviceStreamProps } from './deviceStream';
import { StateType } from '../../../../shared/redux/state';
import { NonFunctionProperties, FunctionProperties } from '../../../../shared/types/types';
import { getConnectionStringSelector } from '../../../../login/selectors';
import { CloudToDeviceMessageParameters } from '../../../../api/parameters/deviceParameters';
import { initiateDeviceStreamAction } from '../../actions';

const mapStateToProps = (state: StateType): NonFunctionProperties<DeviceStreamProps> => {
    return {
        connectionString: getConnectionStringSelector(state)
    };
};

const mapDispatchToProps = (dispatch: Dispatch): FunctionProperties<DeviceStreamProps> => {
    return {
        onInitiateDeviceStream: (parameters: CloudToDeviceMessageParameters) => dispatch(initiateDeviceStreamAction.started(parameters))
    };
};

export default compose(withRouter, connect(mapStateToProps, mapDispatchToProps))(DeviceStream);
