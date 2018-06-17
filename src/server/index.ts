import * as akala from '@akala/server';
import { scrapper } from '@domojs/media';
import { DbTvShow, tvdbScrapper, setLanguage } from './scrapper';
export * from './scrapper';

akala.injectWithNameAsync(['$isModule', '$master', '$config.@domojs/media-tvdbscrapper'], function (isModule: akala.worker.IsModule, master: akala.worker.MasterRegistration, config: PromiseLike<any>)
{
    if (isModule('@domojs/media-tvdbscrapper'))
    {
        master(__dirname, './master');
        if (config)
            config.then(function (config)
            {
                if (config && config.language)
                    setLanguage(config.language);
            });

        akala.worker.createClient('media').then((client) =>
        {
            var s = akala.api.jsonrpcws(scrapper).createClient(client)({
                scrap: function (media: DbTvShow)
                {
                    console.log('tvdbscrapper');
                    return tvdbScrapper(media.type, media).then((newPath) =>
                    {
                        return media;
                    });
                }
            }).$proxy();
            s.register({ type: 'video', priority: 20 });
        });
    }
});