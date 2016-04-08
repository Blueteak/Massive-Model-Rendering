/**
 * Created by jfs on 4/5/16.
 */
// Occlusion Culling Pseudo Code

var polygon = require('polygon');
var clip = require('polygon.clip');
var dz = require('dz');
var qh = require('quick-hull-2d');

function OcclusionData(objects)
{
    var Boxes = calculateBoxes(objects);
    var Cells = generateCells(Boxes);
    for(var cell in Cells)
    {
        var Occluders = getObjectData(objects);
        var Occludees = getObjectData(objects);
        for(var i=0; i<Occluders.length; i++) {
            if(intersection(Occludees[i].boundingBox, cell.verts)) {
                //Objects that intersect cell are visible and will give invalid results when getting projections
                cell.visibleObjs.add(Occludees[i]);
                Occluders.removeAt(i);
                Occludees.removeAt(i);
            }
            else {
                Occluders[o.id].distance = MaxDistance(cell.center, Occluders[i].verts);
                Occludees[o.id].distance = MinDistance(cell.center, Occludees[i].verts);
            }
        }

        for(var vert in cell.verts) {
            for(var i=0; i<Occluders.length; i++) {
                Occluders[i].projection.add( getProjection(Occluders[i].verts, vert, Occluders[i].center));
                Occludees[i].projection.add( getProjection(Occludees[i].verts, vert, Occludees[i].center));
            }
        }
        for(var i=0; i<Occluders.length; i++) {
            Occludees[i].projection = PolyUnion(Occludees[i].projection); //Union all in projection array
            Occludees[i].projection = PolyIntersect(Occludees[i].projection); //Intersect all in projection array
        }
        Occludees.sort(object.distance);
        Occluders.sort(object.distance);
        for(var i=0; i<Occluders.length; i++)
        {
            for(var k=i; k<Occludees.length; i++)
            {
                //Using npm Polygon package
                if(Occluders[i].projection.contains(Occludees[k].projection)) {
                    Occluders.removeAt(k);
                    Occludees.removeAt(k);
                    cell.visible.remove(Occludees[Occludees[k].id]); //Remove fully occluded object from visible set
                }
                //Using npm Polygon package
                else if(PolygonOverlap(Occluders[i].projection, Occludees[k].projection)) {
                    //Create combined overlap for partial overlap
                    Occluders[i].projection = PolygonUnion([Occluders[i].projection, Occludees[k].projection]);
                }
            }
        }
    }
    return Cells;
}

function calculateBoxes(objs)
{
    var boxes = [];
    //Calculate bounding boxes
    return boxes;
}

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

function getObjectData(objects)
{
    var data = [];
    for(var o in objects)
    {
        var newObj = {"id": o.id, "projection": [], "verts": o.verts, "distance": 0};
        data.add(newObj);
    }
    return data;
}

function getProjection(refPt, verts, objCenter)
{
    var perspective = dz.projection.perspective();
    perspective.camera().position(refPt).lookAt(objCenter);
    var TwoDPoints = [];
    for(var v in verts)
    {
        TwoDPoints.add(perspective(v));
    }
    return qh(TwoDPoints);
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

function PolygonOverlap(p1, p2)
{
    var points = p1.toArray();
    for(var v in points)
    {
        if(p2.containsPoint(v))
            return true;
    }
    return false;
}

//Using npm Polygon package
function PolyUnion(polyArray)
{
    var pUnion = polyArray[0];
    for(var p in polyArray)
    {
        pUnion = pUnion.union(p);
    }
    return pUnion;
}

//Using npm Polygon.clip package
function PolyIntersect(polyArray)
{
    var pUnion = polyArray[0];
    for(var p in polyArray)
    {
        var pC = clip(p);
        pUnion = pC.clip(pUnion, 'union');
    }
    return pUnion;
}