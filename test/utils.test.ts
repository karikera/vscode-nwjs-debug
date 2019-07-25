/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as mockery from 'mockery';
import * as assert from 'assert';

import * as testUtils from './testUtils';

/** Utils without mocks - use for type only */
import * as _Utils from '../src/utils';

const MODULE_UNDER_TEST = '../src/utils';
suite('Utils', () => {
    function getUtils(): typeof _Utils {
        return require(MODULE_UNDER_TEST);
    }

    setup(() => {
        testUtils.setupUnhandledRejectionListener();
        testUtils.registerLocMocks();

        mockery.enable({ useCleanCache: true, warnOnReplace: false, warnOnUnregistered: false });
        mockery.registerMock('fs', { statSync: () => { }, existsSync: () => false });
    });

    teardown(() => {
        testUtils.removeUnhandledRejectionListener();

        mockery.deregisterAll();
        mockery.disable();
    });

    suite('getTargetFilter()', () => {
        test('defaultTargetFilter', () => {
            const {defaultTargetFilter} = getUtils();
            const targets = [{type: 'page'}, {type: 'webview'}];
            assert.deepEqual(targets.filter(defaultTargetFilter), [{type: 'page'}]);
        });

        test('getTargetFilter', () => {
            const {getTargetFilter} = getUtils();
            const targets = [{type: 'page'}, {type: 'webview'}];
            assert.deepEqual(targets.filter(getTargetFilter(['page'])), [{type: 'page'}]);
            assert.deepEqual(targets.filter(getTargetFilter(['webview'])), [{type: 'webview'}]);
            assert.deepEqual(targets.filter(getTargetFilter(['page', 'webview'])), targets);
            // Falsy targetTypes should effectively disable filtering.
            assert.deepEqual(targets.filter(getTargetFilter()), targets);
        });
    });
});
