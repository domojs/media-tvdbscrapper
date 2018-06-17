import * as akala from '@akala/server';
import { Client, Connection } from '@akala/json-rpc-ws';
import { scrapper } from '@domojs/media';
import { DbTvShow, tvdbScrapper, setLanguage } from './scrapper';
export * from './scrapper';

akala.injectWithNameAsync(['$isModule', '$config.@domojs/media-tvdbscrapper', '$agent.media'], function (isModule: akala.worker.IsModule, config: PromiseLike<any>, client: PromiseLike<Client<Connection>>)
{
    if (isModule('@domojs/media-tvdbscrapper'))
    {
        if (config)
            config.then(function (config)
            {
                if (config && config.language)
                    setLanguage(config.language);
            });

        var s = akala.api.jsonrpcws(scrapper).createClient(client)({
            scrap: function (media: DbTvShow)
            {
                console.log('tvdbscrapper');
                return tvdbScrapper(media.type, media).then((newPath) =>
                {
                    media['optimizedPath'] = newPath;
                    return media;
                });
            }
        }).$proxy();
        s.register({ type: 'video', priority: 20 });
    }
});