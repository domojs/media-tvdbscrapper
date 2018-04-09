import * as akala from '@akala/server';
import { scrapper } from '@domojs/media';
import { DbTvShow, tvdbScrapper, setLanguage } from './scrapper';
import * as path from 'path';
export * from './scrapper';

akala.injectWithName(['$isModule', '$master', '$config'], function (isModule: akala.worker.IsModule, master: akala.worker.MasterRegistration, config: any)
{
    if (isModule('@akala/server'))
    {
        master(__dirname, './master');
        if (config && config.language)
            setLanguage(config.language);

        akala.worker.createClient('media').then((client) =>
        {
            var s = scrapper.createClient(client)({
                scrap: function (media: DbTvShow)
                {
                    var fileName = path.basename(media.path);
                    return tvdbScrapper(media.type, media).then(() =>
                    {
                        return media;
                    });
                }
            }).$proxy();
            s.register({ type: 'video', priority: 20 });
        });
    }
})();