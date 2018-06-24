import 'source-map-support/register'
import * as akala from '@akala/server';

import * as mock from 'mock-require';
mock('@akala/server', akala);

akala.register('$isModule', function () { return false });

import * as self from '../server/scrapper';
self.setLanguage('fr');
// var media: self.DbTvShow = { name: 'altered carbon', type: 'video', path:'file://///ana.dragon-angel.fr/videos/tv series/altered carbon/altered carbon - s1 e1.mkv' } as any;
var media: self.DbTvShow = { name: 'Requiem for the Phantom', type: 'video', path:'', displayName:'Requiem for the Phantom - E1', episode:1 } as any;
self.tvdbScrapper('video', media).then((path) =>
{
    media.optimizedPath=path;
    console.log(media);
});