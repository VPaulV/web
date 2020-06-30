import { WebApplication } from '@/ui_models/application';
import template from './challenge-modal.pug';
import {
  ChallengeType,
  ChallengeValue,
  removeFromArray,
  Challenge,
  ChallengeReason,
} from 'snjs';
import { PureViewCtrl } from '@Views/abstract/pure_view_ctrl';
import { WebDirective } from '@/types';
import { confirmDialog } from '@/services/alertService';
import { STRING_SIGN_OUT_CONFIRMATION } from '@/strings';

type InputValue = {
  value: string
  invalid: boolean
}

type Values = Record<ChallengeType, InputValue>

type ChallengeModalState = {
  types: ChallengeType[]
  values: Partial<Values>
  processing: boolean,
  forgotPasscode: boolean,
  showForgotPasscodeLink: boolean,
}

class ChallengeModalCtrl extends PureViewCtrl {
  private $element: JQLite
  private processingTypes: ChallengeType[] = []
  application!: WebApplication
  challenge!: Challenge
  private cancelable = false

  /* @ngInject */
  constructor(
    $element: JQLite,
    $timeout: ng.ITimeoutService
  ) {
    super($timeout);
    this.$element = $element;
  }

  getState() {
    return this.state as ChallengeModalState;
  }

  $onInit() {
    super.$onInit();
    const values = {} as Values;
    const types = this.challenge.types;
    for (const type of types) {
      values[type] = {
        value: '',
        invalid: false
      };
    }
    const showForgotPasscodeLink = this.challenge.reason === ChallengeReason.ApplicationUnlock
    this.cancelable = !showForgotPasscodeLink
    this.setState({
      types,
      values,
      processing: false,
      forgotPasscode: false,
      showForgotPasscodeLink,
      hasAccount: this.application.hasAccount(),
    });
    this.application.setChallengeCallbacks({
      challenge: this.challenge,
      onValidValue: (value) => {
        this.getState().values[value.type]!.invalid = false;
        removeFromArray(this.processingTypes, value.type);
        this.reloadProcessingStatus();
      },
      onInvalidValue: (value) => {
        this.getState().values[value.type]!.invalid = true;
        removeFromArray(this.processingTypes, value.type);
        this.reloadProcessingStatus();
      },
      onComplete: () => {
        this.dismiss();
      },
    });
  }

  deinit() {
    (this.application as any) = undefined;
    (this.challenge as any) = undefined;
    super.deinit();
  }

  reloadProcessingStatus() {
    this.setState({
      processing: this.processingTypes.length > 0
    });
  }

  promptForChallenge(challenge: ChallengeType) {
    if (challenge === ChallengeType.LocalPasscode) {
      return 'Enter your application passcode';
    } else {
      return 'Enter your account password';
    }
  }

  async destroyLocalData() {
    if (await confirmDialog({
      text: STRING_SIGN_OUT_CONFIRMATION,
      confirmButtonStyle: "danger"
    })) {
      await this.application.signOut();
      this.dismiss();
    };
  }

  cancel() {
    if (!this.cancelable) {
      return;
    }
    this.dismiss();
  }

  onForgotPasscodeClick() {
    this.setState({
      forgotPasscode: true
    });
  }

  onTextValueChange(challenge: ChallengeType) {
    const values = this.getState().values;
    values[challenge]!.invalid = false;
    this.setState({ values });
  }

  validate() {
    const failed = [];
    for (const type of this.getState().types) {
      const value = this.getState().values[type];
      if (!value || value.value.length === 0) {
        this.getState().values[type]!.invalid = true;
      }
    }
    return failed.length === 0;
  }

  async submit() {
    if (!this.validate()) {
      return;
    }
    await this.setState({ processing: true });
    const values = [];
    for (const key of Object.keys(this.getState().values)) {
      const type = Number(key) as ChallengeType;
      if (this.getState().values[type]!.invalid) {
        continue;
      }
      const rawValue = this.getState().values[type]!.value;
      const value = new ChallengeValue(type, rawValue);
      values.push(value);
    }
    this.processingTypes = values.map((v) => v.type);
    if (values.length > 0) {
      this.application.submitValuesForChallenge(this.challenge, values);
    } else {
      this.setState({ processing: false });
    }
  }

  dismiss() {
    const elem = this.$element;
    const scope = elem.scope();
    scope.$destroy();
    elem.remove();
  }
}

export class ChallengeModal extends WebDirective {
  constructor() {
    super();
    this.restrict = 'E';
    this.template = template;
    this.controller = ChallengeModalCtrl;
    this.controllerAs = 'ctrl';
    this.bindToController = true;
    this.scope = {
      challenge: '=',
      application: '='
    };
  }
}
