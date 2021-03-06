var url       = require('url')
  , request   = require('request')
  , config    = getConfiguration(require('fs'), 'api/config.json')
  , apiKey    = config.thesaurus_api_key
  , thesaurus = require('mongojs').connect(config.db_url, ['words']);

function getConfiguration(fs, path) {
    try {
        var cfg = JSON.parse(fs.readFileSync(path).toString());

        // Check whether the application is running in production
        if (process.env.NODE_ENV !== 'production') {
            cfg.db_url = 'thesaurus';
        }

        return cfg;

    } catch (e) {
        console.error('There was an error getting configuration data:');
        console.log(e);
        process.exit(1);
    }
}

function handleWordQuery(request, response) {
    var word = processRequest(request);

    if (word) { // Only respond to a correctly formed query string

        // Try to find the word's entry in the database
        thesaurus.words.find({ is: word }, function(error, result) {

            if (error) {
                console.error('There was an query error:');
                console.log(error);

            } else if (result && result[0] && result[0].is === word) {

                // If the word was found, send it as JSON
                try {
                    response.writeHead(200, {'Content-type': 'text/json'});
                    response.end(JSON.stringify(result[0]));
                } catch (e) {
                    console.error('There was a parse error:');
                    console.log(e);
                }

            } else { // If the word wasn't found, get it from the API:
                accessApi(word, response);
            }
        });

    } else {
        response.writeHead(400);
        response.end();
    }
}

function accessApi(word, response) {

    if (apiKey) {
        var url = 'http://words.bighugelabs.com/api/2/' + apiKey + '/' + word + '/json';

        request(url, function (error, headers, body) {
            if (!error && headers.statusCode == 200) {
                try {
                    var wordObject = processWordData(JSON.parse(body), word);

                    // Send the word to the application
                    response.writeHead(200, {'Content-type': 'text/json'});
                    response.end(JSON.stringify(wordObject));

                    // Save the word in the database
                    thesaurus.words.save(wordObject, function (error, saved) {
                        if (error || !saved) {
                            console.error('There was a problem saving a word:');
                            console.log(error);
                            console.log(wordObject);
                        }
                    });
                } catch (e) {
                    console.error('There was a parse error:');
                    console.log(e);
                }
            } else {
                console.error('API access error:');
                console.log(error);
                console.log(headers);
            }
        });
    }

    function processWordData (word, wordStr) {
        word.is = wordStr;
        word.rank = 0;

        var types = [], strings, objects;

        for (var wordType in word) {

            if (wordType !== 'is' && wordType !== 'rank') {

                for (var listType in word[ wordType ]) {
                    strings = word[ wordType ][ listType ];
                    objects = [];

                    // Convert string representations of synonyms into dicts
                    if (strings && strings.length) {
                        for (var i = 0; i < strings.length; i++)
                            objects.push({ is: strings[i] });
                        word[ wordType ][ listType ] = objects;
                    }
                }

                types.push(wordType);
            }
        }

        word.types = types;
        return word;
    }
}

function handleWordUpdate(request, response) {
    var words = processRequest(request);

    if (words) { // Only respond to a correctly formed query string
        var source  = words.original
          , synonym = words.replacement
          , type    = words.type;

        // Finds synonym on word (if synonym is object
        var synonymQuery = { is: source };
        synonymQuery[ type + '.is'] = synonym;

        // Increments found synonym's rank.
        // $ operator is used to reference found synonym index
        // $inc operator increments present value
        var synonymRankInc = { $inc: {} };
        synonymRankInc.$inc[ type + '.$.rank' ] = 1;

        console.log(synonymQuery);
        console.log(synonymRankInc);

        // Update word with modified synonym+rating sets
        thesaurus.words.update(
            synonymQuery,
            synonymRankInc,
            function(error, updated) {
                thesaurus.words.find({ is: source }, function(e, result) {
                    console.log(result);
                });

                if (error) {
                    console.error('Word not updated.');
                    console.log(error);

                } else if (!updated) {

                }
            }
        );
    }
}

function processRequest(request) {
    var data = url.parse(request.url, true),
        type = request.method;

    if ('query' in data && data.query && (type === 'GET' || type === 'POST')) {
        return type === 'GET' ? validateGet(data) : validatePost(data);
    }

    function validateGet(data) {
        return ('word' in data.query) ? data.query.word : null;
    }

    function validatePost(data) {
        return ('original' in data.query &&
             'replacement' in data.query &&
                    'type' in data.query) ?
                              data.query  : null;
    }
}

module.exports.handleWordQuery  = handleWordQuery;
module.exports.handleWordUpdate = handleWordUpdate;
