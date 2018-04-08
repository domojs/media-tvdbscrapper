import * as akala from '@akala/server';

akala.injectWithName(['$isModule', '$master'], function (isModule: akala.worker.IsModule, master: akala.worker.MasterRegistration)
{
    if (isModule('@akala/server'))
        master(__dirname, './master');

    require("./scrapper");
})();