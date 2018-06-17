import * as akala from '@akala/server';
import * as path from 'path'
import * as levenshtein from 'levenshtein';
import { MediaType, TVShow, Movie } from '@domojs/media';
import * as url from 'url';
const APIKEY = '833A54EE450AAD6F';
const log = akala.log('domojs:media:tvdbscrapper');


var http: akala.Http = akala.resolve('$http');

export interface DbTvShow extends TVShow
{
    tvdbid: number;
}

export interface DbTvMovie extends Movie
{
    tvdbid: number;
    displayName: string;
    overview: string;
}

export function setLanguage(l: string)
{
    api.setLanguage(l);
}

namespace api
{
    export interface JWT
    {
        token: string;
    }
    var language = 'en'
    var currentJwt: JWT;

    export function setLanguage(l: string)
    {
        language = l;
    }

    export interface SearchResult
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

    export interface SeriesResult
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

    export interface EpisodeResult
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

    export interface ImageTypeResult
    {
        keyType: 'poster' | 'banner' | 'fanart' | 'season' | 'series',
        resolution: string[];
        subKey: string[];
    }

    export interface ImageResult
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

    export interface ImageCountResult
    {
        "fanart": number,
        "poster": number,
        "season": number,
        "seasonwide": number,
        "series": number
    }

    export interface ActorResult
    {
        "id": number,
        "image": string,
        "imageAdded": string,
        "imageAuthor": number,
        "lastUpdated": string,
        "name": string,
        "role": string,
        "seriesId": number,
        "sortOrder": number
    }

    export function authenticate(): PromiseLike<JWT>
    {
        return http.call({
            url: 'https://api.thetvdb.com/login',
            method: 'post',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apikey: APIKEY }),
            type: 'json'
        }).then((response) =>
        {
            if (response.status == 200)
                return response.json().then((json) =>
                {
                    log(json);
                    return currentJwt = json;
                }) as PromiseLike<JWT>;
            throw response;
        });
    }

    export function searchSerieByName(name: string, language?: string, jwt?: JWT)
    {
        return sendRequest<SearchResult[]>('/search/series', { name: name }, language, jwt);
    }

    export function getSerie(id: number, language?: string, jwt?: JWT)
    {
        return sendRequest<SeriesResult>(`/series/${id}`, null, language, jwt);
    }
    export function getEpisodes(id: number, language?: string, jwt?: JWT)
    {
        return sendRequest<EpisodeResult[]>(`/series/${id}/episodes`, null, language, jwt);
    }
    export function getActors(id: number, language?: string, jwt?: JWT)
    {
        return sendRequest<ActorResult[]>(`/series/${id}/actors`, null, language, jwt);
    }
    export function countImagesByType(id: number, jwt?: JWT)
    {
        return sendRequest<ImageCountResult>(`/series/${id}/images`, null, null, jwt);
    }
    export function getImageTypes(id: number, jwt?: JWT)
    {
        return sendRequest<ImageTypeResult[]>(`/series/${id}/images/query/params`, null, null, jwt);
    }
    export function getImagesByType(id: number, imageType: 'poster' | 'banner' | 'fanart' | 'season' | 'series', jwt?: JWT)
    {
        return sendRequest<ImageResult[]>(`/series/${id}/images/query`, { keyType: imageType }, 'en', jwt);
    }
    export function sendRequest<T>(path: string, queryString: { [key: string]: string | string[] }, requestLanguage?: string, jwt?: JWT): PromiseLike<T>
    {
        jwt = jwt || currentJwt;
        requestLanguage = requestLanguage || language;
        if (!jwt)
            return authenticate().then((jwt) =>
            {
                return sendRequest<T>(path, queryString, requestLanguage, jwt);
            });
        return http.call({
            url: url.format(new url.URL(path, 'https://api.thetvdb.com/')),
            queryString: queryString,
            type: 'json',
            method: 'GET',
            headers: { authorization: 'Bearer ' + jwt.token, "accept-language": requestLanguage || 'en' }
        }).then(function (result)
        {
            if (result.status == 404)
                return null;
            if (result.status == 200)
                return result.json().then(function (json) { return json.data });
            return Promise.reject(result) as PromiseLike<T>;
        }, function (err)
            {
                console.error(err);
                return Promise.reject(err);
            });
    }
}

type cache = { serie: api.SeriesResult, poster?: api.ImageResult, episodes: api.EpisodeResult[], banner?: api.ImageResult };
var tvdbNameCache: { [key: string]: PromiseLike<api.SearchResult[]> } = {};
var tvdbCache: { [key: number]: PromiseLike<cache> } = {};
export function tvdbScrapper(mediaType: MediaType, media: DbTvShow): PromiseLike<string>
{

    var handleSerie = function (cacheItem: cache, confidence: number)
    {
        var newName = media.displayName;
        if (cacheItem.poster && (media.episode == 1 || !media.episode))
            media.cover = 'https://thetvdb.com/banners/' + cacheItem.poster.fileName;
        if (cacheItem.episodes)
        {
            media.episodes = cacheItem.episodes.length;
            var matchingEpisode = akala.grep(cacheItem.episodes, function (e: api.EpisodeResult)
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

        if ('Animation' in cacheItem.serie.genre)
            if (confidence > 0.5)
                return 'Animes/' + cacheItem.serie.seriesName + '/' + newName + path.extname(media.path);
            else
                return 'Animes/' + (media.originalName || media.name) + '/' + newName + path.extname(media.path);
        else
            return 'TV Series/' + cacheItem.serie.seriesName + '/' + newName + path.extname(media.path);
    };
    var buildPath = function (Series: api.SearchResult, confidence: number)
    {
        if (Series.overview)
            media.overview = Series.overview;
        media.tvdbid = Series.id;
        if (confidence > 0.8)
            media.name = Series.seriesName;
        if (!tvdbCache[media.tvdbid])
            tvdbCache[media.tvdbid] = api.getSerie(media.tvdbid).then((serie) =>
            {
                return api.getEpisodes(media.tvdbid).then((episodes) =>
                {
                    return api.getImageTypes(media.tvdbid).then((types) =>
                    {
                        return new Promise<cache>((resolve, reject) =>
                        {
                            var cacheItem: cache = { serie: serie, episodes: episodes };
                            if (!types)
                                return resolve(cacheItem);
                            akala.eachAsync(types, function (type: api.ImageTypeResult, i, next)
                            {
                                api.getImagesByType(media.tvdbid, type.keyType).then((image) =>
                                {
                                    if (image != null)
                                        switch (type.keyType)
                                        {
                                            case 'poster':
                                                cacheItem.poster = image[0];
                                                break;
                                            case 'banner':
                                                cacheItem.banner = image[0];
                                                break;
                                            default:
                                                break;
                                        }
                                    next();
                                }, function (err)
                                    {
                                        log(err);
                                        if (err)
                                            next(err);
                                    });
                            }, function (err)
                                {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(cacheItem)
                                })
                        }) as PromiseLike<cache>;
                    })
                });
            });
        return tvdbCache[media.tvdbid].then((serie) => handleSerie(serie, confidence));

    };
    var confidence = function (name: string, names: string[])
    {
        var max = 0;
        name = name.toLowerCase().replace(/[^A-Z0-9 ]/gi, '');
        if (names)
        {
            log(`${name} confidence in ${names}`);
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
        }
        return max;;
    };
    function handleResults(item: api.SearchResult[])
    {
        /*if(media.name.toLowerCase()=='forever')
        {
            console.log(data.Series);
        }*/
        if (item && item.length == 1)
        {
            return buildPath(item[0], confidence(media.name, [item[0].seriesName].concat(item[0].aliases)));
        }
        else if (item && item.length === 0)
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
            var matchingSeries: api.SearchResult = null;
            if (item)
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
                    log(item);
                return Promise.resolve(media.path);
            }
        }
    }

    if (media.tvdbid)
    {
        if (!tvdbCache[media.tvdbid])
            tvdbCache[media.tvdbid] = api.getSerie(media.tvdbid).then((serie) =>
            {
                return api.getEpisodes(media.tvdbid).then((episodes) =>
                {
                    return api.getImageTypes(media.tvdbid).then((types) =>
                    {
                        return new Promise<cache>((resolve, reject) =>
                        {
                            var cacheItem: cache = { serie: serie, episodes: episodes };
                            akala.eachAsync(types, function (type: api.ImageTypeResult, i, next)
                            {
                                api.getImagesByType(media.tvdbid, type.keyType).then((image) =>
                                {
                                    if (image != null)
                                        switch (type.keyType)
                                        {
                                            case 'poster':
                                                cacheItem.poster = image[0];
                                                break;
                                            case 'banner':
                                                cacheItem.banner = image[0];
                                                break;
                                            default:
                                                break;
                                        }
                                    next();
                                }, function (err)
                                    {
                                        log(err);
                                        if (err)
                                            next(err);
                                    });
                            }, function (err)
                                {
                                    if (err)
                                        reject(err);
                                    else
                                        resolve(cacheItem)
                                })
                        }) as PromiseLike<cache>;
                    })
                });
            });
        tvdbCache[media.tvdbid].then(cache => handleSerie(cache, 1));
    }

    if (!tvdbNameCache[media.name])
        tvdbNameCache[media.name] = api.searchSerieByName(media.name);
    return tvdbNameCache[media.name].then(handleResults, function (err)
    {
        if (err)
            log(err);
        throw err;
    });
}