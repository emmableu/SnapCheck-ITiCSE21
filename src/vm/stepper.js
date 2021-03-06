import {TestCase, Callback} from './test-case'
import {extend, extendObject} from "isnap/src/isnap/util";
import {TestHelper} from "./test-helper";
import {Process} from "isnap/src/threads";
import {Morph} from "isnap/src/morphic";
import {StageMorph} from "isnap/src/objects";

class Stepper {

    constructor (vm) {
        /**
         * @type {vm}
         */
        this.vm = vm;
        this.ide = vm.ide;

        /**
         * @type {TestCase[]}
         */
        this.testCases = [];

        /**
         * @type {Boolean}
         */
        this.running = false;

        /**
         * @type{number}
         */
        this.stepCount = 0;

        /**
         * @type {Callback[]}
         */
        this._callbacks = [];
    }

    reset () {
        this.clearTestCases();
        this.running = false;
        this.stepCount = 0;
        extend(StageMorph, 'step', function(base){
            base.call(this);
        });
    }

    addTestCase (testCase) {
        this.testCases.push(testCase);
    }

    removeTestCaseByName (name) {
        this.testCases.filter(t => t.name === name).forEach(t => t.withdraw());
    }

    clearTestCases () {
        this.testCases = [];
        this._callbacks = [];
    }

    async start (testCases) {
        this.reset();
        for (let testCase of testCases){
            if (testCase !== undefined) {
                this.addTestCase(this.vm.testHelper.bindTestCase(testCase));
            }
        }
        let myself = this;
        // await new Promise(r => {setTimeout(r, 100)});
        this.ide.stage.fireGreenFlagEvent();
        // await new Promise(r => {setTimeout(r, 200)});
        extend(StageMorph, 'step', function(base){
            myself.step();
            base.call(this);
        });
    }


    step () {
        this.vm.state.update();
        this.stepCount++;
        // console.log(this.vm.testHelper.spriteIsTouching('Right Paddle', 'Ball') );

        this.testCases.forEach(t => {
            t._precondition = t.precondition();
        });
        // console.log('this.testCases: ', this.testCases);
        // firing testCases are those whose callback will be added
        const firingTestCases = this.testCases
            .filter(t => t.active)
            // either it is a regular testCase and precondition is satisfied
            // or it is debounced testCase at trailling edge
            .filter(t => (!t.debounce && t._precondition) ||
                (t.debounce && t._continuing && !t._precondition));

        // save states for testCases
        this.testCases.filter(t => t.active)
        // either it is a firing regular testCase
        // or a debounced testCase at leading edge
            .filter(t => (!t.debounce && t._precondition) ||
                (t.debounce && !t._continuing && t._precondition))
            .forEach(t => {
                t._savedState = t.stateSaver();
            });

        // set continuing status for all testCases
        this.testCases.forEach(t => {
            t._continuing = t._precondition;
        });

        // get the callbacks of these testCases
        const callbacks = firingTestCases
            .map(t => {
                t.deactivate();
                t._callback = new Callback(
                    t._savedState,
                    t.delay,
                    t.callback,
                    t);
                return t._callback;
            });
        // add all activated callbacks to the callback queues
        this._callbacks.unshift(...callbacks);

        // fire callback if delay reaches 0
        this._callbacks.forEach(c => c.countdown());

        // cleanup callbacks and testCases that are no longer alive
        this._callbacks = this._callbacks.filter(c => c.alive);
        this.testCases = this.testCases.filter(t => t.alive);

        this.vm.inputs.tick();

    }
}

export {Stepper};
