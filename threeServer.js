/**
 * Created by jfs on 2/23/16.
 */
var express     = require('express'),
   // wait        = require('wait.for'),
   // fs          = require('fs'),
    knox        = require('knox'),
    _           = require('underscore'),
    sio         = require('socket.io');
var app = express();
var http        = require('http').Server(app);
var io          = require('socket.io')(http);
var config      = require('config.json')('./sample.json');

app.use(express.static('public'));
//app.use(bodyParser.urlencoded({ extended: true }));

var SceneObj = "dragon";
var bounds;
var haveBounds = false;

/*
app.get('/model/:name', function(req, res) {
    wait.launchFiber(getModel, req, res);
});
*/

getBounds(SceneObj);

function getBounds(name)
{
    var client = knox.createClient({
        key: config.s3.key,
        secret: config.s3.secret,
        bucket: config.s3.bucket
        // endpoint: '192.168.99.100',
        // port: 32769
    });
    var buffer = '';
    client.get(name+':bounds').on('response', function(res){
        res.setEncoding('utf8');
        res.on('data', function(chunk){
            buffer += chunk.toString();
        });
        res.on('end', function(){
            console.log('Got Bounds');
            bounds = JSON.parse(buffer);
            buffer = null;
            haveBounds = true;
        });
    }).end();
}

var getting = false;

var id = "";

io.on('connection', function(socket){
    console.log('a user connected');
    socket.emit('boundingBoxes', bounds);
    socket.on('disconnect', function(){
        console.log('user disconnected');
    });
    socket.on('updateCamera', function(msg)
    {
        var toCheck = [];
        if(haveBounds)
        {
            var i = 0;
            while(bounds[''+i] != undefined)
            {
                if(containsPoint(msg, bounds[''+i].min || bounds[''+i].max))
                {
                    toCheck.push(SceneObj+':obj'+i);
                }
                i++;
            }
            socket.emit('checkModels', toCheck);
        }
    });
    socket.on('needModels', function(msg)
    {
        for(var i=0; i<msg.length; i++)
        {
            setTimeout(dbModel(msg[i], socket), 0);
        }
    });
});

function containsPoint(frustum, point)
{
    var planes = frustum.planes;
    for ( var i = 0; i < planes.length; i ++ ) {
        if ( distance(planes[i], point) < 0 ) {
            return false;
        }
    }
    return true;
}

function distance(plane, point)
{
    var p = (plane.normal.x*point[0] + plane.normal.y*point[1] + plane.normal.z*point[2]) + plane.constant;
    return p;
}

function dbModel(name, socket)
{
    var client = knox.createClient({
        key: config.s3.key,
        secret: config.s3.secret,
        bucket: config.s3.bucket
        // endpoint: '192.168.99.100',
        // port: 32769
    });
    var buffer = '';
    //console.log('Getting File: ' + name);
    client.get(name).on('response', function(res){
        res.setEncoding('utf8');
        res.on('data', function(chunk){
            buffer += chunk.toString();
        });
        res.on('end', function(){
            console.log('Got File: ' + name);
            if(socket)
                socket.emit('getModel', JSON.stringify({modelName: name, modelObj: buffer}));
            buffer = '';
            getting = false;
        });
    }).end();
}

var server = http.listen(8080, function () {
    console.log('Server listening on ' + server.address().port);
});