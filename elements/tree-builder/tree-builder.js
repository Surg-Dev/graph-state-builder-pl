var canvas;

var caretTimer;
var caretVisible = true;
var cursorVisible = true;
var movingObject = false;
var selectedObject = null;
var tempObj = null;
var originalClick;

const snapToPadding = 6; // pixels
const hitTargetPadding = 6; // pixels

var nodes = [];
var root = null;
var links = [];

var answersName = null;

var nodeRadius = 30;

var shift = false;


function tree_builder_init(name, backupJson, editable){
    // Get canvas from page and initialize context.
    answersName = name;
    canvas = document.getElementById(answersName + '-tree-canvas');

    restoreBackup(backupJson)
    draw();


    // If the student is not allowed to edit, we return after drawing.
    if (!editable){
        return;
    }

    canvas.onmousedown = function (e) {
        // Get mouse position and select object if possible.
        var mouse = crossBrowserRelativeMousePos(e);
        selectedObject = selectObject(mouse.x, mouse.y);
        movingObject = false;
        originalClick = mouse;

        if (selectedObject != null) {
            // If the player shift-drags, we create a temporary link + node graphic.
            if (shift && selectedObject instanceof Node) {
                if (selectObject.left == null || selectObject.right == null){
                    tempObj = new TemporaryLink(selectedObject, originalClick, mouse);
                }
            } else {
                // Otherwise we are moving the object.
                if (selectedObject instanceof Node) {
                    movingObject = true;
                    deltaMouseX = deltaMouseY = 0;
                    if (selectedObject.setMouseStart) {
                        selectedObject.setMouseStart(mouse.x, mouse.y);
                    }
                }
            }
            resetCaret();
        }

        draw();

        if (canvasHasFocus()) {
            // disable drag-and-drop only if the canvas is already focused
            return false;
        } else {
            // otherwise, let the browser switch the focus away from wherever it was
            resetCaret();
            return true;
        }
    };

    canvas.ondblclick = function (e) {
        var mouse = crossBrowserRelativeMousePos(e);
        selectedObject = selectObject(mouse.x, mouse.y);

        // Only allow the first dbl click to create a root node.
        if (selectedObject == null) {
            if (root == null){
                selectedObject = new Node(mouse.x, mouse.y);
                root = selectedObject;
                nodes.push(selectedObject);
                resetCaret();
                draw();
            }
        }
    };

    canvas.onmousemove = function (e) {
        var mouse = crossBrowserRelativeMousePos(e);

        if (tempObj != null){
            tempObj = new TemporaryLink(tempObj.parent, originalClick, mouse);
            draw();
        }

        if (movingObject) {
            var trueX = -1;
            var trueY = -1;
            if (selectedObject instanceof Node) {
                if (selectedObject.parent != null){
                    // Prevent the user from moving the left or right node past the center of parent.
                    if (selectedObject.parent.left == selectedObject){
                        if (mouse.x < selectedObject.parent.x){
                            trueX = mouse.x;
                        } else{
                            trueX = selectedObject.parent.x;
                        }
                        if (mouse.y > selectedObject.parent.y){
                            trueY = mouse.y;
                        } else{
                            trueY = selectedObject.parent.y;
                        }
                    
                    } else{
                        if (mouse.x > selectedObject.parent.x){
                            trueX = mouse.x;
                        } else{
                            trueX = selectedObject.parent.x;
                        }
                        if (mouse.y > selectedObject.parent.y){
                            trueY = mouse.y;
                        } else{
                            trueY = selectedObject.parent.y;
                        }
                    }
                } else{
                    // Prevent moving the root below it's children, if they exist.
                    if (selectedObject.left != null){
                        if (mouse.y < selectedObject.left.y){
                            trueY = mouse.y;
                        } else{
                            trueY = selectedObject.left.y;
                        }
                    }
                    if (selectedObject.right != null){
                        if (mouse.y < selectedObject.right.y){
                            trueY = mouse.y;
                        } else{
                            if (trueY == -1){
                                trueY = selectedObject.right.y;
                            } else{
                                trueY = Math.min(trueY, selectedObject.right.y);
                            }
                        }
                    }
                }
                if (trueX == -1){
                    trueX = mouse.x;
                }
                if (trueY == -1){
                    trueY = mouse.y;
                }
                selectedObject.setAnchorPoint(trueX, trueY);
                snapNode(selectedObject);
            }
            draw();
        }
    };

    canvas.onmouseup = function (e) {
        movingObject = false;
        // If we are making a temporary link, we need to create a new node and link.
        if (tempObj != null){
            var parentNode = tempObj.parent;
            // Make it the left or right child based on position.
            // If the node already exists, we don't create a new one.
            if (parentNode.x < tempObj.to.x){
                if (parentNode.right == null){
                    selectedObject = new Node(tempObj.to.x, tempObj.to.y);
                    selectedObject.parent = parentNode;
                    
                    link = new Link(parentNode, selectedObject);
                    links.push(link);
                    
                    parentNode.right = selectedObject;  
                    nodes.push(selectedObject);

                    resetCaret();
                    draw();
                }
            } else if (parentNode.x > tempObj.to.x){
                if (parentNode.left == null){
                    selectedObject = new Node(tempObj.to.x, tempObj.to.y);
                    selectedObject.parent = parentNode;
                    
                    link = new Link(parentNode, selectedObject);
                    links.push(link);
                    
                    parentNode.left = selectedObject; 
                    nodes.push(selectedObject);
                    resetCaret();
                    draw();                    
                }
            }
        }
        tempObj = null;
        draw();

    };

    // Right click to delete. Return false to prevent OS context menu.
    canvas.oncontextmenu = function (e) {
        deleteSelectedObject()
        return false;
    }
}

document.onkeydown = function (e) {
    var key = crossBrowserKey(e);

    if (key == 16) {
        shift = true;
    } else if (!canvasHasFocus()) {
        // don't read keystrokes when other things have focus
        return true;
    } else if (key == 8) { // backspace key
        if (selectedObject != null && 'text' in selectedObject) {
            selectedObject.text = selectedObject.text.substr(0, selectedObject.text.length - 1);
            resetCaret();
            draw();
        }

        // backspace is a shortcut for the back button, but do NOT want to change pages
        return false;
    } else if (key == 46) { // delete key
        deleteSelectedObject()
    }
};

document.onkeyup = function (e) {
    var key = crossBrowserKey(e);

    //Release shift.
    if (key == 16) {
        shift = false;
    }
};

document.onkeypress = function (e) {
    // don't read keystrokes when other things have focus
    var key = crossBrowserKey(e);
    keyBounds = false

    if (selectedObject instanceof Node) {
        keyBounds = (key >= 0x20 && key <= 0x7E)
    }
    if (!canvasHasFocus()) {
        // don't read keystrokes when other things have focus
        return true;

    } else if (keyBounds && !e.metaKey && !e.altKey && !e.ctrlKey && selectedObject != null && 'text' in selectedObject) {
        // Reset highlighting when user types

        selectedObject.text += String.fromCharCode(key);
        resetCaret();
        draw();

        // don't let keys do their actions (like space scrolls down the page)
        return false;
    } else if (key == 8) {
        // backspace is a shortcut for the back button, but do NOT want to change pages
        return false;
    }
};

function draw() {
    drawUsing(canvas.getContext('2d'));
    saveBackup();
}   

function drawUsing(c){
    c.clearRect(0, 0, canvas.width, canvas.height);
    c.save();
    // c.translate(0.5, 0.5);

    for (var i = 0; i < links.length; i++){
        c.lineWidth = 1;
        var color = 'black'
        c.fillStyle = c.strokeStyle = color    
        links[i].draw(c);
    }

    for (var i = 0; i < nodes.length; i++){
        c.lineWidth = 1;
        var color = 'black'
        if (nodes[i] == selectedObject) {
            color = 'blue'
        }
        c.fillStyle = c.strokeStyle = color
        nodes[i].draw(c);
    }

    if (tempObj){
        c.lineWidth = 1;
        c.fillStyle = c.strokeStyle = 'black'
        tempObj.draw(c);
    }
}


function selectObject(x, y) {
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].containsPoint(x, y)) {
            return nodes[i];
        }
    }
    return null;
}

function drawText(c, originalText, x, y, angleOrNull, isSelected) {
    text = originalText
    //text = convertLatexShortcuts(originalText);
    c.font = '20px "Times New Roman", serif';
    var width = c.measureText(text).width;

    // Attempt to keep text within the bounds of the node
    if (width > nodeRadius + 16) {
        var newpx = 20 - parseInt((width - nodeRadius) / 8);
        if (newpx < 10) newpx = 10;
        c.font = newpx + 'px "Times New Roman", serif';
        width = c.measureText(text).width;
    }

    // center the text
    x -= width / 2;

    // position the text intelligently if given an angle
    if (angleOrNull != null) {
        var cos = Math.cos(angleOrNull);
        var sin = Math.sin(angleOrNull);
        var cornerPointX = (width / 2 + 5) * (cos > 0 ? 1 : -1);
        var cornerPointY = (10 + 5) * (sin > 0 ? 1 : -1);
        var slide = sin * Math.pow(Math.abs(sin), 40) * cornerPointX - cos * Math.pow(Math.abs(cos), 10) * cornerPointY;
        x += cornerPointX - sin * slide;
        y += cornerPointY + cos * slide;
    }

    // draw text and caret (round the coordinates so the caret falls on a pixel)
    if ('advancedFillText' in c) {
        c.advancedFillText(text, originalText, x + width / 2, y, angleOrNull);
    } else {
        x = Math.round(x);
        y = Math.round(y);
        c.fillText(text, x, y + 6);
        if (isSelected && caretVisible && canvasHasFocus() && document.hasFocus()) {
            x += width;
            c.beginPath();
            c.moveTo(x, y - 10);
            c.lineTo(x, y + 10);
            c.stroke();
        }
    }
}

function snapNode(node) {
    for (var i = 0; i < nodes.length; i++) {
        if (nodes[i] == node) continue;

        if (Math.abs(node.x - nodes[i].x) < snapToPadding) {
            node.x = nodes[i].x;
        }

        if (Math.abs(node.y - nodes[i].y) < snapToPadding) {
            node.y = nodes[i].y;
        }
    }
}

function canvasHasFocus() {
    return (document.activeElement || document.body) == document.body;
}

function resetCaret() {
    clearInterval(caretTimer);
    caretTimer = setInterval('caretVisible = !caretVisible; draw()', 500);
    caretVisible = true;
}

function crossBrowserKey(e) {
    e = e || window.event;
    return e.which || e.keyCode;
}

function crossBrowserRelativeMousePos(e) {
    var element = crossBrowserElementPos(e);
    var mouse = crossBrowserMousePos(e);
    return {
        'x': mouse.x - element.x,
        'y': mouse.y - element.y
    };
}

function crossBrowserMousePos(e) {
    e = e || window.event;
    return {
        'x': e.pageX || e.clientX + document.body.scrollLeft + document.documentElement.scrollLeft,
        'y': e.pageY || e.clientY + document.body.scrollTop + document.documentElement.scrollTop,
    };
}

function crossBrowserElementPos(e) {
    e = e || window.event;
    var obj = e.target || e.srcElement;
    var x = 0, y = 0;
    while (obj.offsetParent) {
        x += obj.offsetLeft;
        y += obj.offsetTop;
        obj = obj.offsetParent;
    }
    return { 'x': x, 'y': y };
}

function deleteSelectedObject() {
    if (selectedObject != null) {
        for (var i = 0; i < nodes.length; i++) {
            if (nodes[i] == selectedObject) {
                // Only allow deletion of nodes with no children.
                if (nodes[i].left == null && nodes[i].right == null) {
                    if (nodes[i] == root){
                        root = null;
                    }
                    if (nodes[i].parent != null){
                        if (nodes[i].parent.left == nodes[i]){
                            nodes[i].parent.left = null;
                        }
                        else{
                            nodes[i].parent.right = null;
                        }
                    }
                    nodes.splice(i--, 1);

                    for (var j = 0; j < links.length; j++) {
                        if (links[j].nodeA == selectedObject || links[j].nodeB == selectedObject) {
                            links.splice(j--, 1);
                        }
                    }
                }
            }
        }

        selectedObject = null;
        draw();
    }
}

function drawArrow(c, x, y, angle) {
    var dx = Math.cos(angle);
    var dy = Math.sin(angle);
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x - 8 * dx + 5 * dy, y - 8 * dy - 5 * dx);
    c.lineTo(x - 8 * dx - 5 * dy, y - 8 * dy + 5 * dx);
    c.moveTo(x,y);
    c.fill();
}

function saveBackup() {
    if (!JSON){
        return;
    }

    var parentTemp = [];

    for (var i = 0; i < nodes.length; i++) {
        parentTemp.push(nodes[i].parent);
        nodes[i].parent = null;
    }

    var backup = {
        'root': root,
        'nodeRadius': nodeRadius
    }

    $('input#' + answersName + '-raw-json').val(JSON.stringify(backup));


    for (var i = 0; i < nodes.length; i++) {
        nodes[i].parent = parentTemp[i];
    }    
}


function restoreBackup(backupJson){
    if (!backupJson || !JSON) {
        return;
    }

    var backup = {}
    try {
        backup = JSON.parse(backupJson)
    } catch (e) {
        return;
    }

    nodeRadius = backup.nodeRadius

    restoreNode(backup.root, true)

}

function restoreNode(node, isRoot){
    if (!node){
        return null;
    }
    var tNode = new Node(node.x, node.y);
    tNode.text = unescapeHtml(node.text);
    nodes.push(tNode);
    if (node.left != null){
        nodeLeft = restoreNode(node.left, false);
        links.push(new Link(tNode, nodeLeft));
        nodeLeft.parent = tNode;
        tNode.left = nodeLeft;
    }
    if (node.right != null){
        nodeRight = restoreNode(node.right, false);
        links.push(new Link(tNode, nodeRight));
        nodeRight.parent = tNode;
        tNode.right = nodeRight;
    }

    if (isRoot){
        root = tNode;
    }
    return tNode
}

function escapeHtml(unsafe)
{
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

function unescapeHtml(safe)
{
    return safe
         .replace(/&amp;/g, "&")
         .replace(/&lt;/g, "<")
         .replace(/&gt;/g, ">")
         .replace(/&quot;/g, '"')
         .replace(/&#039;/g, "'");
 }
