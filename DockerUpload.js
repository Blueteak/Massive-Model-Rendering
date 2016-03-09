/**
 * Created by jfs on 3/6/16.
 */

var knox        = require('knox');
var config      = require('config.json')('./sample.json')

var client = knox.createClient({
    key: config.s3.Docker.key,
    secret: config.s3.Docker.secret,
    bucket: config.s3.Docker.bucket,
    endpoint: config.s3.Docker.endpoint,
    port: config.s3.Docker.port
});

doUpload("/Users/jonathanschenker/Desktop/teapotsLarge.txt", "teapotsLarge.txt");

function doUpload(uri, name)
{
    client.putFile(uri, name, function(err, res){
        if(!err)
        {
            console.log("Finished Upload");
            res.resume();

        }
        else
            console.log(err);
    });
}