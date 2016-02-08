/**
 * Created by jonathanschenker on 1/28/16.
 */
var express     = require('express'),
    bodyParser  = require('body-parser'),
    redis       = require('redis'),
    knox        = require('knox'),
    resumable   = require('./resumable-node.js')('/tmp/resumable.js/'),
    multipart   = require('connect-multiparty'),
    fs          = require('fs'),
    stream      = require('stream'),
    streamBuffers = require('stream-buffers'),
    MultiPartUpload = require('knox-mpu-alt');


var app = express();
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(multipart());

//Setup Redis Connection
var redisClient = redis.createClient('32768','192.168.99.100');
redisClient.on('ready', function(){
    console.log('Redis Connected');
    redisClient.set('TargValue', 200);
});

//Setup Knox Connection
var client = knox.createClient({
    key: '00',
    secret: '00',
    bucket: 'testBucket',
    endpoint: '192.168.99.100',
    port: 32769
});

//var echoStream = new stream.Writable();
upload = null;
streams = {};
buffers = {};
chunks = {};


//File upload from Resumable.js
app.post('/upload', function(req, res)
{
    var objID = req.body['resumableIdentifier'];
    var numberOfChunks = Math.max(Math.floor(req.body['resumableTotalSize']/(req.body['resumableChunkSize']*1.0)), 1);
    var progress = (req.body['resumableChunkNumber']/numberOfChunks);

    progress = Math.floor(progress*100)/100.0;
    var file = '/'+objID+'.txt';

    if(streams[objID] == null)
    {
        chunks[objID] = 0;
        streams[objID] = new stream.Writable();
        buffers[objID] = new streamBuffers.ReadableStreamBuffer({
            frequency: 10,       // in milliseconds.
            chunkSize: 1024*1024  // in bytes.
        });
        streams[objID]._write = function (chunk, encoding, done) {
            var b = new Buffer(chunk);
            buffers[objID].put(b);
            done();
        };
        var R = client.put(file, {
            'Content-Length': 1024*1024
            , 'Content-Type': 'text/plain'
        });
        R.on('response', function(r)
        {
            chunks[objID]--;
            if(chunks[objID] <= 0)
            {
                console.log("Upload to s3 Success");
                SendToRedis(objID,file);
            }
        });
        buffers[objID].pipe(R);
    }
    chunks[objID]++;
    resumable.write(objID, streams[objID]);

    //Send response back to uploader
    resumable.post(req, function(status, filename, original_filename, identifier)
    {
        console.log('POST', status, original_filename, identifier, "Progress: " + progress+"/1");
        //On Completed upload, update redis
        if(progress >= 1)
        {
           console.log("Upload to Server completed");
        }
        res.status(status).send( {
            // NOTE: Uncomment this funciton to enable cross-domain request.
            //'Access-Control-Allow-Origin': '*'
        });
    });
});


function SendToRedis(modelid, filename)
{
    var model = {
        id: modelid,
        filename: filename
    };

    var modelInfo = {
        id: modelid,
        started: false,
        done: false,
        percent: 0
    };

    redisClient.set('Model:'+modelid, JSON.stringify(modelInfo), function(err, reply) {
        if(!err)
        {
            redisClient.lpush('ModelQ', JSON.stringify(model), function(err, reply) {
                if(!err) {
                    console.log('Redis Data Set');
                    console.log(reply);
                    checkCompletion('Model:'+modelid);
                }
            });
        }

    });
}

worker();

//Continually scans Redis Q for new models
function worker()
{
    setTimeout(function() {
        worker();
    }, 1000);
    redisClient.brpop('ModelQ', 1, function(err, data) {
        if(err != null)
            console.log(err);
        if(data == null)
            return;
        var model = JSON.parse(data[1]);
        var url = model.filename;
        var wrt = fs.WriteStream('temp.txt');
        client.getFile(url, function(err, res){
            // check `err`, then do `res.pipe(..)` or `res.resume()` or whatever.
            if(!err)
            {
                res.pipe(wrt);
            }
        });

    });
}

function checkCompletion(id)
{
    redisClient.on('message', function(channel, msg) {
        console.log( "Client: received on "+channel+" event "+msg );
        redisClient.get('Model'+id, function(err, reply)
        {
            if(err)
                console.log(err)
            var model = JSON.parse(reply);
            if(model)
            {
                var perc = model.percent;
                if(model.started)
                    console.log("Model Processing: " + perc +"% complete");
                if(!model.done)
                    checkCompletion(id);
                else
                    console.log("Model Processing Complete!");
            }
        });
    });
    redisClient.subscribe( "__keyspace@0__:"+id, function (err) {
        if(!err)
        {
            console.log("Successfully subscribed");
        }
    });
}


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