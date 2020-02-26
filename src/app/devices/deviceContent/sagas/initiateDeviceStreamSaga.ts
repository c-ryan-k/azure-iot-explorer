import { Action } from 'typescript-fsa';
import { call, put } from 'redux-saga/effects';
import { initiateDeviceStreamAction } from '../actions';
import { initiateDeviceStream } from '../../../api/services/devicesService';
import { CloudToDeviceMessageParameters, DeviceStreamParameters } from '../../../api/parameters/deviceParameters';
import { addNotificationAction } from '../../../notifications/actions';
import { ResourceKeys } from '../../../../localization/resourceKeys';
import { NotificationType } from '../../../api/models/notification';

export function* initiateDeviceStreamSaga(action: Action<DeviceStreamParameters>) {
    try {
      const response = yield call(initiateDeviceStream, {
        ...action.payload
      });
      const toastId: number = Math.random();
      yield put(
          addNotificationAction.started({
            id: toastId,
            text: {
              translationKey: ResourceKeys.notifications.deviceStreamOpen
            },
            type: NotificationType.success
          })
        );
      yield put(
        initiateDeviceStreamAction.done({
          params: action.payload,
          result: JSON.stringify({response})
        })
      );
    } catch (error) {
        // tslint:disable:no-console
        console.log(error);
        console.dir(error);
        const toastId: number = Math.random();
        yield put(addNotificationAction.started({
            id: toastId,
            text: {
                 translationKey: ResourceKeys.notifications.deviceStreamError,
            },
            type: NotificationType.info,
        }));
    }
}
