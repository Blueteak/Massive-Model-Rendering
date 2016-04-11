/**
 * Created by jfs on 4/5/16.
 */
// Occlusion Culling Pseudo Code

var polygon = require('polygon');
var clip = require('polygon.clip');
var dz = require('dz');
var qh = require('hull');
var Raycast = require('ray-aabb');
var fs = require('fs');

function OcclusionData(objects)
{
    var Boxes = getBoxes(objects.name);
    var Cells = generateCells(Boxes);
    for(var cell in Cells)
    {
        //Get object data into arrays --> likely needs to be stored as files, will have on disk already
        var Occluders = getObjectData(objects);
        var Occludees = getObjectData(objects);

        //Setup potential Occluders/Occludees arrays
        for(var i=0; i<Occluders.length; i++) {
            if(intersection(Occludees[i].boundingBox, cell.verts)) {
                //Objects that intersect cell are visible and will give invalid results when getting projections
                cell.visibleObjs.add(Occludees[i]);
                Occluders.removeAt(i);
                Occludees.removeAt(i);
            }
            else { //Occluders are based in max distance from cell, Occludees based on min (Conservatism)
                Occluders[o.id].distance = MaxDistance(cell.center, Occluders[i].verts);
                Occludees[o.id].distance = MinDistance(cell.center, Occludees[i].verts);
            }
        }

        // Loop through all verts of cell (8) and get 2D projections from each one for all objects
        for(var vert in cell.verts) {
            for(var i=0; i<Occluders.length; i++) {
                // At this point, objects are in same order, only dif is distance, so projection only calculated once
                var proj = getProjection(Occluders[i].verts, vert, Occluders[i].center);
                Occluders[i].projection.add(proj);
                Occludees[i].projection.add(proj);
            }
        }
        //Create single projection for each object based on all vertex projections
        for(var i=0; i<Occluders.length; i++) {
            Occludees[i].projection = PolyUnion(Occludees[i].projection); //Union all in projection array
            Occludees[i].projection = PolyIntersect(Occludees[i].projection); //Intersect all in projection array
        }

        //Sort Occludees and Occluders by distance from visibility cell (needed for combining occlusion)
        Occludees.sort(object.distance);
        Occluders.sort(object.distance);

        //Determine Occludee visibility, remove occluded objects from both sets (Occluded occluder can't occlude)
        for(var i=0; i<Occluders.length; i++)
        {
            for(var k=0; k<Occludees.length; i++)
            {
                if(Occludees[k].distance > Occluders[i].distance) { //Replace with for loop starting at i?
                    if(RayCheck(Occluders[i], Occludees[k], cell)) {
                        //Using npm Polygon package
                        if (Occluders[i].projection.contains(Occludees[k].projection)) {
                            Occluders.removeAt(k);
                            Occludees.removeAt(k);
                            cell.visible.remove(Occludees[Occludees[k].id]); //Remove fully occluded object from visible set
                        }
                        //Using npm Polygon package
                        else if (PolygonOverlap(Occluders[i].projection, Occludees[k].projection)) {
                            //Create combined overlap for partial overlap handling
                            Occluders[i].projection = PolygonUnion([Occluders[i].projection, Occludees[k].projection]);
                        }
                    }
                }
            }
        }
    }
    return Cells;
}

//Get bounding box data from file (should be able to store in memory)
function getBoxes(uri)
{
    var boxes = [];
    var boxStream = fs.createReadStream(uri+":BoundingBoxes.txt");
    boxStream.pipe(split())
        .on("data", function(line) {
            boxes.add(JSON.parse(line));
        });
    //Calculate bounding boxes
    return boxes;
}

//Generate visibility cells based on Bounding box distribution
function generateCells(boxes)
{
    var cells = [
        {
            "verts": [[1,1,-1],[-1,1,-1],[1,-1,-1],[-1,-1,-1],[1,-1,1],[1,1,-1],[1,-1,1],[1,1,1]],
            "center": [0,0,0],
            "visible": ["obj0", "obj1", "obj2..."]
        }
    ];
    //Calculate visibility cells based on box distribution
    return cells;
}

//Parse object files and add a bit more data, likely save back to file
function getObjectData(objects)
{
    var data = [];
    for(var o in objects)
    {
        var newObj = {"id": o.id, "projection": [], "verts": o.verts, "distance": 0, "boundingbox": []};
        data.add(newObj);
    }
    return data;
}

//Get 2D projection from 3D points of object, then perform QuickHull algorithm to create polygon
// DOUBLE CHECK MATH??
function getProjection(refPt, verts, objCenter)
{
    var perspective = dz.projection.perspective();
    perspective.camera().position(refPt).lookAt(objCenter);
    var TwoDPoints = [];
    for(var v in verts)
    {
        TwoDPoints.add(perspective(v));
    }
    return new polygon(qh(TwoDPoints, 20));
}

function MaxDistance(p1, points)
{
    //Get max distance of points to p1
    return p1;
}

function MinDistance(p1, points)
{
    //Get max distance of points to p1
    return p1;
}


//Return true if Occludee is at least partially occluded by occluder at Every vertex in Cell
function RayCheck(occluder, occludee, origin)
{
    var noOverlap = false;
    for(var vert in origin.verts)
    {
        var r1 = Raycast(vert, occludee.boundingbox[0]);
        var r2 = Raycast(vert, occludee.boundingbox[1]);
        if (r1.instersects(occluder.boundingbox) || r2.intersects(occluder.boundingbox))
        {} else {
           noOverlap = true;
        }
    }
    return !noOverlap;
}

//Return true if p2 is entirely contained in p1
function PolygonOverlap(p1, p2)
{
    var points = p2.toArray();
    for(var v in points)
    {
        if(p1.containsPoint(v))
            return true;
    }
    return false;
}

//Create union of multiple polygons
function PolyUnion(polyArray)
{
    var pUnion = polyArray[0]; //Using npm Polygon package
    for(var p in polyArray)
    {
        pUnion = pUnion.union(p);
    }
    return pUnion;
}

//Create intersection of multiple polygons
function PolyIntersect(polyArray)
{
    var pUnion = polyArray[0]; //Using npm Polygon.clip package
    for(var p in polyArray)
    {
        var pC = clip(p);
        pUnion = pC.clip(pUnion, 'union');
    }
    return pUnion;
}