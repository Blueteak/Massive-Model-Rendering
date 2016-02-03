/**
 * Created by jonathanschenker on 1/28/16.
 */
var express     = require('express'),
    bodyParser  = require('body-parser'),
    redis       = require('redis'),
    knox        = require('knox'),
    resumable   = require('./resumable-node.js')('/tmp/resumable.js/'),
    multipart   = require('connect-multiparty'),
    fs          = require('fs');

var app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(multipart());

var redisClient = redis.createClient('32768','192.168.99.100');
redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});

var client = knox.createClient({
    key: '00',
    secret: '00',
    bucket: 'testBucket',
    endpoint: '192.168.99.100',
    port: 32769
});

var uploaded;

var currentFile;

var upStream = fs.createWriteStream('temp.txt');

upStream.on('data', function(data)
{
    console.log('Got Data');
    var headers = {
        'Content-Type': 'text/plain'
    };
    client.putBuffer(data, currentFile, headers, function(err, res){
        if(err)
            console.log(err);
        else
            console.log("success?");
    });
});


app.post('/upload', function(req, res)
{
    uploaded = false;
    var objID = req.body['resumableIdentifier'];
    var numberOfChunks = Math.max(Math.floor(req.body['resumableTotalSize']/(req.body['resumableChunkSize']*1.0)), 1);
    var progress = (req.body['resumableChunkNumber']/numberOfChunks);
    progress = Math.floor(progress*100)/100.0;

    //Write to file, we want to get it off the disk as it comes in (File acts as buffer)
    var R = //client.put('/'+objID+'.txt', {
    {
        'Content-Length': req.body['resumableChunkSize'],
        'Content-Type': 'text/plain'
    };//);

    currentFile = '/'+objID+'.txt';

    resumable.write(objID, upStream);





    /*
    R.on('response', function(result)
    {
       console.log(result);
    });
    */

    /*
    fs.stat('temp.txt', function(err, stat){
        // Be sure to handle `err`.

        var R = client.put('/'+objID+'.txt', {
            'Content-Length': stat.size,
            'Content-Type': 'text/plain'
        });

        fs.createReadStream('temp.txt').pipe(req);

        R.on('response', function(res){
            console.log("Response");
        });
    });
    */

    //This sends back info, is it being stored locally?
    resumable.post(req, function(status, filename, original_filename, identifier)
    {
        console.log('POST', status, original_filename, identifier, "Progress: " + progress+"/1");
        if(progress > 1)
        {
            uploaded = true;
        }
        res.status(status).send( {
            // NOTE: Uncomment this funciton to enable cross-domain request.
            //'Access-Control-Allow-Origin': '*'
        });
    });

    /*
    var model = {
        id: 'ABC'
    }
    redisClient.lpush('ModelQ', JSON.stringify(model), function(err, reply) {
        console.log(reply);
    });
    var modelInfo = {
        id: 'ABC',
        started: false,
        done: false,
        percent: 0
    }
    redisClient.set('Model'+modelInfo.id, JSON.stringify(model), function(err, reply) {
        if(!err)
            checkCompletion(modelInfo.id);
        console.log('Added Test Data');
    });
    */
});

function download(filename)
{
    if(uploaded)
    {
        client.get('/'+filename).on('response', function(res){
            console.log(res.statusCode);
            console.log(res.headers);
            res.setEncoding('utf8');
            res.on('data', function(chunk){
                console.log(chunk);
            });
        }).end();
    }
}


var server = app.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});