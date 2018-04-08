import * as akala from '@akala/server';
import { scrapper } from '@domojs/media';
import * as path from 'path'
import { Response } from 'request';
import * as levenshtein from 'levenshtein';
import { MediaType, TVShow, Movie } from '@domojs/media';
const APIKEY = '833A54EE450AAD6F';

var http: akala.Http = akala.resolve('$http');

interface DbTvShow extends TVShow
{
    tvdbid: number;
}

interface DbTvMovie extends Movie
{
    tvdbid: number;
    displayName: string;
    overview: string;
}

interface JWT
{
    token: string;
}

var currentJwt: JWT;

interface SearchResult
{
    "aliases": string[],
    "banner": string,
    "firstAired": string,
    "id": number,
    "network": string,
    "overview": string,
    "seriesName": string,
    "status": string
}

interface SeriesResult
{
    "added": string,
    "airsDayOfWeek": string,
    "airsTime": string,
    "aliases": string[],
    "banner": string,
    "firstAired": string,
    "genre": string[],
    "id": number,
    "imdbId": string,
    "lastUpdated": number,
    "network": string,
    "networkId": string,
    "overview": string,
    "rating": string,
    "runtime": string,
    "seriesId": number,
    "seriesName": string,
    "siteRating": number,
    "siteRatingCount": number,
    "status": string,
    "zap2itId": string
}

interface EpisodeResult
{
    "absoluteNumber": number,
    "airedEpisodeNumber": number,
    "airedSeason": number,
    "dvdEpisodeNumber": number,
    "dvdSeason": number,
    "episodeName": string,
    "firstAired": string,
    "id": number,
    "lastUpdated": number,
    "overview": string
}

interface ImageResult
{
    "fileName": string,
    "id": number,
    "keyType": string,
    "languageId": number,
    "ratingsInfo": {
        "average": number,
        "count": number
    },
    "resolution": string,
    "subKey": string,
    "thumbnail": string
}

function authenticate(): PromiseLike<JWT>
{
    return http.post('https://api.thetvdb.com/login', { apikey: APIKEY }).then((jwt) =>
    {
        return currentJwt = jwt;
    });
}

function searchSerie(name: string, jwt?: JWT): PromiseLike<SearchResult[]>
{
    jwt = jwt || currentJwt;
    if (!jwt)
        return authenticate().then((jwt) =>
        {
            return searchSerie(name, jwt);
        })
    return http.call({
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + jwt.token },
        params: { name: name },
        url: 'https://api.thetvdb.com/search/series'
    }).then(function (response)
    {
        return JSON.parse(response.body);
    }, function (response: Response)
        {
            if (response.statusCode == 404)
                return null;
        });
}

function fetchSerie(id: number, jwt?: JWT): PromiseLike<SeriesResult>
{
    jwt = jwt || currentJwt;
    if (!jwt)
        return authenticate().then((jwt) =>
        {
            return fetchSerie(name, jwt);
        })
    return http.call({
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + jwt.token },
        params: { name: name },
        url: 'https://api.thetvdb.com/series/' + id
    }).then(function (response)
    {
        return JSON.parse(response.body);
    }, function (response: Response)
        {
            if (response.statusCode == 404)
                return null;
        });
}

function getEpisodes(tvdbid: number, jwt?: JWT): PromiseLike<EpisodeResult[]>
{
    jwt = jwt || currentJwt;
    if (!jwt)
        return authenticate().then((jwt) =>
        {
            return getEpisodes(name, jwt);
        })
    return http.call({
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + jwt.token },
        params: { name: name },
        url: 'https://api.thetvdb.com/search/series/episodes'
    }).then(function (response)
    {
        return JSON.parse(response.body);
    }, function (response: Response)
        {
            if (response.statusCode == 404)
                return null;
        });
}

function searchPoster(tvdbid: number, jwt?: JWT): PromiseLike<ImageResult[]>
{
    jwt = jwt || currentJwt;
    if (!jwt)
        return authenticate().then((jwt) =>
        {
            return searchPoster(name, jwt);
        })
    return http.call({
        method: 'get',
        headers: { 'Authorization': 'Bearer ' + jwt.token },
        params: { keyType: 'poster' },
        url: 'https://api.thetvdb.com/series/' + tvdbid + '/images/query'
    }).then(function (response)
    {
        return JSON.parse(response.body);
    }, function (response: Response)
        {
            if (response.statusCode == 404)
            {
                return null;
            }
        });
}

type cache = { serie: SeriesResult, poster: ImageResult, episodes: EpisodeResult[] };
var tvdbNameCache: { [key: string]: PromiseLike<SearchResult[]> } = {};
var tvdbCache: { [key: number]: PromiseLike<cache> } = {};
function tvdbScrapper(mediaType: MediaType, media: DbTvShow)
{
    var buildPath = function (Series: SearchResult, confidence: number)
    {
        if (Series.overview)
            media.overview = Series.overview;
        media.tvdbid = Series.id;
        if (confidence > 0.8)
            media.name = Series.seriesName;
        var newName = media.displayName;
        var handleSerie = function (cacheItem: cache)
        {
            //console.log(media.path);
            if (cacheItem.poster && (media.episode == 1 || !media.episode))
                media.cover = 'https://thetvdb.com/banners/' + cacheItem.poster.fileName;
            if (cacheItem.episodes)
            {
                media.episodes = cacheItem.episodes.length;
                var matchingEpisode = akala.grep(cacheItem.episodes, function (e: EpisodeResult)
                {
                    return media.episode && e.airedEpisodeNumber == media.episode && (!media.season || media.season == e.airedSeason[0]);
                })[0];
                if (matchingEpisode)
                {
                    media.absoluteEpisode = matchingEpisode.absoluteNumber;
                    if (confidence > 0.5 && media.episode)
                        newName = newName + ' - ' + matchingEpisode.airedEpisodeNumber[0]
                }
            }

            if (cacheItem.serie.genre.indexOf('Animation') > -1)
                if (confidence > 0.5)
                    return 'Animes/' + Series.seriesName + '/' + newName + path.extname(media.path);
                else
                    return 'Animes/' + (media.originalName || media.name) + '/' + newName + path.extname(media.path);
            else
                return 'TV Series/' + Series.seriesName + '/' + newName + path.extname(media.path);
        };
        if (!tvdbCache[media.tvdbid])
            tvdbCache[media.tvdbid] = fetchSerie(media.tvdbid).then((serie) =>
            {
                return getEpisodes(media.tvdbid).then((episodes) =>
                {
                    return searchPoster(media.tvdbid).then((images) =>
                    {
                        return { serie: serie, episodes: episodes, poster: images[0] };
                    })
                });
            });
        return tvdbCache[media.tvdbid].then(handleSerie);

    };
    var confidence = function (name: string, names: string[])
    {
        var max = 0;
        name = name.toLowerCase().replace(/[^A-Z0-9 ]/gi, '');
        if (names)
            akala.each(names, function (n)
            {
                var tokens = n.replace(/ \([0-9]{4}\)$/, '').replace(/[^A-Z0-9 ]/gi, '').toLowerCase();
                var lev = new levenshtein(name, tokens).distance;
                var c = 1 - lev / tokens.length;
                if (lev < 3 && c >= max)
                {
                    max = c;
                }
                var tokenArray = tokens.split(' ');
                var match = akala.grep(tokenArray, function (token: string)
                {
                    var indexOfToken = name.indexOf(token);
                    return token.length > 0 && indexOfToken > -1 && (indexOfToken + token.length == name.length || /^[^A-Z]/i.test(name.substring(indexOfToken + token.length)));
                });
                c = match.length / name.split(' ').length * match.length / tokenArray.length;
                if (c >= max)
                    max = c;
            });
        return max;;
    };
    function handleResults(item: SearchResult[])
    {
        /*if(media.name.toLowerCase()=='forever')
        {
            console.log(data.Series);
        }*/
        if (item && item.length == 1)
        {
            return buildPath(item[0], confidence(media.name, [item[0].seriesName].concat(item[0].aliases)));
        }
        else if (item.length === 0)
        {
            var splittedName = media.name.split(' ');
            if (splittedName.length > 1)
            {
                return tvdbScrapper(mediaType, akala.extend({}, media, { name: splittedName[0], originalName: media.name })).then((result) => { return result; },
                    (error) =>
                    {
                        return tvdbScrapper(mediaType, akala.extend({}, media, { name: splittedName[1], originalName: media.name }));
                    });
            }
            else
                return Promise.reject({ code: 404, message: 'Not found' });
        }
        else
        {
            var name = media.originalName || media.name;
            var max = 0;
            var matchingSeries: SearchResult = null;
            akala.each(item, function (serie)
            {
                var c = confidence(name, [serie.seriesName].concat(serie.aliases));
                if (c >= max)
                {
                    if (c != max)
                    {
                        /*if(matchingSeries)
                            console.log('replacing '+matchingSeries.SeriesName+'('+max+') by '+serie.SeriesName+'('+c+')');*/
                        max = c;
                        matchingSeries = serie;
                    }
                }
            });
            if (matchingSeries)
                return buildPath(matchingSeries, max);
            else
            {
                console.log('could no find a matching serie for ' + name);
                if (item)
                    console.log(item);
                return Promise.resolve(media);
            }
        }
    }
    if (!tvdbCache[media.name])
        tvdbNameCache[media.name] = searchSerie(media.name);
    return tvdbNameCache[media.name].then(handleResults);
}

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