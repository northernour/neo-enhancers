// ==UserScript==
// @name         Neoboard Enhancer
// @namespace    https://www.github.com/setherium
// @version      0.1
// @description  Adds new functionality to the Neopets Neoboards
// @author       setherium
// @include      http://www.neopets.com/neoboards/topic.phtml?topic=*
// @include      http://www.neopets.com/neoboards/preferences.phtml
// @include      http://www.neopets.com/neoboards/preferences.phtml*
// @include      http://www.neopets.com/neoboards/create_topic.phtml*
// @require      https://code.jquery.com/jquery-3.4.1.min.js
// @grant        GM.info
// ==/UserScript==

// The Client ID/API key is needed to upload images to the image host.
const CLIENT_ID = ($.isEmptyObject(getPreferences())) ? "f9d99488fda7a0e" : getPreferences().apiKey;
const MAX_FILE_SIZE_IN_BYTES = 2 * 1024 * 1024;    // 2 MiB

// Shorthand URL constants
const URL = {
    NEOBOARD:    GM.info.script.includes[0],         // Where we copy bets from
    PREFERENCES: GM.info.script.includes[1],         // Where we place the bets
    CURRENT:     window.location.href,               // The current URL
    UPLOADAPI:   "https://api.imgur.com/3/image"     // To upload to Imgur
};

// Perhaps someday we'll support more than just Imgur
const NEO_IMAGE_DATA = {
    KEY: "#",
    IDENTIFIERS: {
        IMGUR: "i"
    },
};

/**
 *  Main function
 */
(async function() {
    "use strict";

    // If we're on the preferences page, add a spot to insert your own API key.
    if (URL.CURRENT.includes(URL.PREFERENCES)) {
        let apiHtml = `
            <p>
                <h3>
                    API Key
                </h3>
            </p>
            <p>
                In order to upload images, you need an
                <a href="https://api.imgur.com/oauth2/addclient">
                    API key (Client ID)
                </a>
                for anonymous usage. Currently only Imgur is supported. You are free
                to use the default API key provided here, but note that you will be
                sharing it with everyone else using the Neoboard Enhancer userscript,
                and you may encounter rate limits. It is recommended you obtain your
                own API key to avoid service interruptions.
            </p>
            <p>
                <h4>
                    NOTE:
                </h4>
                This key is stored locally; clearing your cache/history/cookies/etc.
                will reset this value back to the default. Leave blank to reset.
            </p>
            <p>
                <label for="apiKey">API Key: </label>
                <input type="text" id="apiKey" value="${CLIENT_ID}">
            </p>
        `;
        $("td[class='topic']").append(apiHtml);

        // Piggyback on the already existing submit button to save/reset these preferences.
        $("input[type='Submit'][value='Submit']").on("click", function() {
            if ($("#apiKey").val().length) {
                setPreferences({
                    apiKey: $("#apiKey").val()
                });
            } else {
                resetPreferences();
            }
        });
    } else {
        // Adjust the appearance of any Neoboard topic to have the image uploader.
        // Inspiration from: https://www.labnol.org/code/20526-javascript-image-uploader
        // Inspiration from: https://gist.github.com/bmcbride/7577e6aed5ce962776ca

        // Create upload form
        $("<input>", {
            id:     "fileUploader",
            type:   "file",
            accept: "image/gif, image/jpeg, image/png"
        })
        .appendTo(
            // Put it below the character remainder for either the create topic screen or reply.
            ($(".topicCreateRemainder").length) ? $(".topicCreateRemainder") : $(".topicReplyRemainder")
        )
        .on("change", function () {
            let $files = $(this).get(0).files;

            // Don't proceed if no files are detected
            if (!$files.length) return false;

            // Let's be nice to Imgur and limit uploads to 2 MiB.
            if ($files[0].size > MAX_FILE_SIZE_IN_BYTES) {
                alert(  "Sorry: your file exceeds the maximum size of " +
                        (MAX_FILE_SIZE_IN_BYTES / 1024 / 1024) + " MiB."   );
                return false;
            }

            // Preparing the request to upload to Imgur.
            let settings = {
                url: URL.UPLOADAPI,
                type: "POST",
                headers: {
                    Authorization: "Client-ID " + CLIENT_ID
                },
                mimeType: 'multipart/form-data',
                dataType: "json",
                crossDomain: true,
                processData: false,
                contentType: false,
            };

            let formData = new FormData();
            formData.append("image", $files[0]);
            settings.data = formData;

            // Initiate upload process
            console.log("Starting upload to Imgur...");

            // Make the network call to upload the image
            $.ajax(settings)
            .done(function (response) {
                $("textarea[name='message']").val(function (i, text) {
                    return text + "\n" + formatImageCode(response.data);
                });
                console.log(response);
            })
            .fail(function () {
                alert("Oops! The upload failed for some reason. Please try again.");
            });
        });

        // If we're not viewing a topic, don't waste time continuing
        if (URL.CURRENT.includes(URL.NEOBOARD)) return;

        // Parse images in Neoboard posts
        let $posts = $(".boardPostMessage");
        $.each($posts, function(i, post) {
            // Only process for images if there exists the image indicator
            if ($(post).text().includes(NEO_IMAGE_DATA.KEY)) {
                const REGEX = /#\w+\([A-Za-z0-9]*\)/g;
                let newHtml = $(post)
                .html()
                .replace(REGEX, function(match) {
                    let imgId = match.substring(match.indexOf('(') + 1, match.indexOf(')'));
                    let imgUrl = getImageHost(match) + imgId + getFileType(match);
                    return `<p>
                                <a href="${imgUrl}">
                                    <img width="75%"
                                         src="${imgUrl}"
                                    />
                                </a>
                            </p>`;
                });

                // Update the HTML after we've inserted all the images
                $(post).html(newHtml);

                console.log("Replaced");
            }
        });
    }
})();

/**
 *  Takes the response data from the image host and formats it to be ready for
 *  posting on the Neoboards.
 *  @param data The data property of the response from the image host.
 *  @return Formatted string of the form #i(aBcD123)
 */
function formatImageCode(data) {
    let imgId = data.id;
    // Ex: Turns the ID AEYAego to the string #i(AEYAego)
    return NEO_IMAGE_DATA.KEY +
           NEO_IMAGE_DATA.IDENTIFIERS.IMGUR +
           '(' +
           imgId +
           ')';
}

/**
 *  Tells us which image host the image should come from.
 *  @param match The regex match returned while replacing all instances in the post.
 *  @return URL for image host.
 */
function getImageHost(match) {
    switch (match.charAt(1)) {
        case NEO_IMAGE_DATA.IDENTIFIERS.IMGUR:
        default:
            return "https://i.imgur.com/";
    }
}

/**
 *  Determine the filetype from the image code. For some reason, Imgur
 *  automatically knows which to use, so just default to .png. It even works with
 *  gifs, surprisingly.
 *  @param match The regex match returned while replacing all instances in the post.
 *  @return The filetype.
 */
function getFileType(match) {
    /*
    switch (match.charAt(2)) {
        case 'j':
            return ".jpg";
        case 'g':
            return ".gif";
        case 'p':
            return ".png";
    }
    */
    return ".png";
}

/**
 *  Saves our input from the Neoboards preferences page.
 *  @param prefs JSON object containing the custom data we enter on the preferences page.
 */
function setPreferences(prefs)
{
    try {
        localStorage.setItem("preferences", JSON.stringify(prefs));
    } catch (error) {
        alert("Error saving preferences: " + error);
    }
}

/**
 *  Retrieves a JSON object containing our custom Neoboard preferences.
 *  @return JSON object containing the custom data we enter on the preferences page.
 */
function getPreferences()
{
    let prefs = localStorage.getItem("preferences");
    return JSON.parse(prefs) || {};
}

/**
 *  Resets our custom Neoboard preferences.
 */
function resetPreferences()
{
    localStorage.removeItem("preferences");
}
