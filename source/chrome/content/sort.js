/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the SortPlaces extension.
 *
 * The Initial Developer of the Original Code is Andy Halford.
 * Portions created by the Initial Developer are Copyright (C) 2008-2011
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

try {
	Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
} catch(ex) {
	Components.utils.import("resource://gre/modules/utils.js");
}

var SortPlacesSort = {
	prefs: Components.classes["@mozilla.org/preferences-service;1"]
									 .getService(Components.interfaces.nsIPrefService)
									 .getBranch("extensions.sortplaces."),
	defaults: Components.classes["@mozilla.org/preferences-service;1"]
										  .getService(Components.interfaces.nsIPrefService)
									 		.getDefaultBranch("extensions.sortplaces."),
	sp_descAnno: "bookmarkProperties/description",
	sp_sortBy: ["sort_name_m0", "unsorted_m1", "sort_name_m2"],
	sp_text: [true, true],
	sp_caseInsensitive: [false, false, false],
	sp_reverseFactor: [1, 1, 1],
	sp_queryOrder: 1,
	sp_folderOrder: 2,
	sp_livemarkOrder: 3,
	sp_bookmarkOrder: 4,
	includeFolders: [],
	excludeFolders: [],

	//Sort bookmarks
	sortBookmarks: function(windowShowing) {
		function checkFolderExists(folderID) {
			try {
				var type = PlacesUtils.bookmarks.getItemType(folderID);

			} catch(exception) {
				return false;
			}
			return true;
		}
		function checkFolderType(folderID) {
			var type = PlacesUtils.bookmarks.getItemType(folderID);
			return (type == PlacesUtils.bookmarks.TYPE_FOLDER);
		}
		function closeWindow(failed) {
			if (windowShowing) {
				failed ? SortPlacesSort.showStatus('sort_failed') :
								 SortPlacesSort.showStatus('sort_completed');
				setTimeout(window.close, 1000);
			}
		}

		//START HERE
		if (windowShowing) this.showStatus('sorting');

		//Migrate old settings (reverse them)
		try {
			SortPlacesSort.prefs.setBoolPref("include", !SortPlacesSort.prefs.getBoolPref("include_all"));
			SortPlacesSort.prefs.setBoolPref("exclude", !SortPlacesSort.prefs.getBoolPref("exclude_none"));
			this.prefs.clearUserPref("include_all");
			this.prefs.clearUserPref("exclude_none");
		} catch (e) {
		}

		SortPlacesSort.includeFolders = [];	//This means include everything (ie start at PlacesUtils.placesRootId)
		if (SortPlacesSort.prefs.getBoolPref("include")) {
			SortPlacesSort.includeFolders = SortPlacesSort.prefs.getCharPref("include_folder_ids").split(",");
			if (!SortPlacesSort.includeFolders.length || !SortPlacesSort.includeFolders[0])
				SortPlacesSort.includeFolders = [];
			else {
				for (var i=0; i<SortPlacesSort.includeFolders.length; i++) {
					if (!checkFolderExists(SortPlacesSort.includeFolders[i])) {
						SortPlacesSort.alert('missing_subfolder');
						this.showStatus('sort_failed');
						closeWindow(true);
						return;
					}
					else if (!checkFolderType(SortPlacesSort.includeFolders[i])) {
						SortPlacesSort.alert('wrong_type_subfolder');
						this.showStatus('sort_failed');
						closeWindow(true);
						return;
					}
				}
			}
		}

		SortPlacesSort.excludeFolders = [];
		if (SortPlacesSort.prefs.getBoolPref("exclude")) {
			SortPlacesSort.excludeFolders = SortPlacesSort.prefs.getCharPref("exclude_folder_ids").split(",");
			if (!SortPlacesSort.excludeFolders.length || !SortPlacesSort.excludeFolders[0]) SortPlacesSort.excludeFolders = [];
		}

		//Run it in batch mode cos updating a lot of bookmarks
		var batch = {
			runBatched: function() {
				//Do the query
				var options = PlacesUtils.history.getNewQueryOptions();
				var query = PlacesUtils.history.getNewQuery();
				query.setFolders([PlacesUtils.placesRootId], 1);
				var result = PlacesUtils.history.executeQuery(query, options);

				//Trawl through the results sorting them as required
				//If no includeFolders then include everything
//Components.utils.reportError("Sorting Started");
				SortPlacesSort.sortContainer(result.root, null, !SortPlacesSort.includeFolders.length,
				SortPlacesSort.prefs.getBoolPref("sort_folders"));
			}
		}

		//Run it in batch mode cos updating a lot of bookmarks
		var failed = false;
		try {
			PlacesUtils.bookmarks.runInBatchMode(batch, null);

		} catch(e) {
			//Report the original error just in case
			Components.utils.reportError(e);

			//If fails then run it in non-batch mode to trap the error better
			try {
				batch.runBatched();

			} catch(e1) {
				failed = true;
				this.alert(null, e1);
			}
		}

		closeWindow(failed);
	},

	//Display my own style alert
	alert: function(key, exception) {
		var params = {inn:{key:key, exception:exception}, out:null};
		window.openDialog('chrome://sortplaces/content/alert.xul', '_blank',
											'chrome,modal,centerscreen', params);
	},

	showStatus: function(message) {
		var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
										.getService(Components.interfaces.nsIStringBundleService)
										.createBundle("chrome://sortplaces/locale/sortplaces.properties");
		var status = document.getElementById("status");
		status.value = bundle.GetStringFromName(message);
	},

	onAlertLoad: function() {
		var key = window.arguments[0].inn.key;
		var exception = window.arguments[0].inn.exception;
		if (exception) {
			Components.utils.reportError(exception);
			var message = "O/S: ";
			try {
				message = message + Components.classes["@mozilla.org/xre/app-info;1"]
											 .createInstance(Components.interfaces.nsIXULRuntime).OS;
			} catch(e) {
			}
			var version = "";
			try {
				var info = Components.classes["@mozilla.org/xre/app-info;1"]
						       					 .getService(Components.interfaces.nsIXULAppInfo);
				version = "%0A" + info.name + ": " + info.version + " " + info.appBuildID;
			} catch(e) {
			}
			message = message + version + "%0ASortPlaces: ";
			message = message + this.prefs.getCharPref("version") + "%0A%0A" + exception.toString() + "%0A%0APrefs:";

			//Iterate over the prefs
			try {
				var prefList = this.defaults.getChildList("", {});
				for (var i = 0 ; i < prefList.length ; i++) {
					var id = prefList[i];
					switch (this.defaults.getPrefType(id)) {
						case this.defaults.PREF_BOOL:
							message = message + "%0A" + id + ": " + this.prefs.getBoolPref(id);
						break;

						case this.defaults.PREF_STRING:
							message = message + "%0A" + id + ": " + this.prefs.getCharPref(id);
						break;
					}
				}
			} catch(e) {
			}

			var link = "mailto:andy@andyhalford.com?subject=SortPlaces%20Exception&body=" + message;
			document.getElementById("link").href=link;
			document.getElementById("text").value = exception.toString();
		}
		else {
			var bundle = Components.classes["@mozilla.org/intl/stringbundle;1"]
	           					.getService(Components.interfaces.nsIStringBundleService)
           						.createBundle("chrome://sortplaces/locale/sortplaces.properties");
			document.getElementById("message").value = bundle.GetStringFromName(key);
			document.getElementById("link").hidden = true;
			document.getElementById("text").hidden = true;
		}
		document.documentElement.getButton("accept").focus();
	},

	getMenuOptions: function(type) {
		//Sort order
		this.sp_queryOrder = this.prefs.getCharPref("query_precedence_" + type);
		this.sp_folderOrder = this.prefs.getCharPref("folder_precedence_" + type);
		this.sp_livemarkOrder = this.prefs.getCharPref("livemark_precedence_" + type);
		this.sp_bookmarkOrder = this.prefs.getCharPref("bookmark_precedence_" + type);

		//Sort by
		for (var i=0; i<this.sp_sortBy.length; i++ ) {
			var itemType = type + i;
			this.sp_sortBy[i] = this.prefs.getCharPref("sort_by_" + itemType);
			this.sp_text[i] = (this.sp_sortBy[i] == ("sort_name_" + itemType) ||
												 this.sp_sortBy[i] == ("sort_keyword_" + itemType) ||
												 this.sp_sortBy[i] == ("sort_description_" + itemType) ||
												 this.sp_sortBy[i] == ("sort_location_" + itemType));
			this.sp_reverseFactor[i] = this.prefs.getBoolPref("reverse_sort_" + itemType) ? -1 : 1;
			this.sp_caseInsensitive[i] = this.prefs.getBoolPref("case_insensitive_" + itemType);
		}
	},

	sortContainer: function(container, type, sortContents, sortFolders) {
		function asContainer(container) {
			return container.QueryInterface(Components.interfaces.nsINavHistoryContainerResultNode);
		}

		//Ignore links and other non-folders
		if (container.itemId == -1 ||
				PlacesUtils.getConcreteItemId(container) != container.itemId)
		{
			return;
		}

		//Ignore the tags folder
		if (container.itemId == PlacesUtils.tagsFolderId)	return;

		//Ignore excluded folders
		for (var i=0; i<this.excludeFolders.length; i++) {
			if (container.itemId == this.excludeFolders[i]) return;
		}

		//Open the container and look inside
		asContainer(container).containerOpen = true;
		var count = container.childCount;

		//Sometimes the container doesn't open
		//In which case skip it
		try {
			//Just a dummy test
			if (count > 0) var tested = true;
		} catch (e) {
				try {
					asContainer(container).containerOpen = false;
				} catch(e1) {
				}
				return;
		}

		//Recurse down the tree
		var items = [count + 1];
		var sepIndex = [];
		sepIndex.push(-1);
		for (var i = 0; i < count; i++) {
			var child = container.getChild(i);
			var item = {};
			item.id = child.itemId;
			item.sep = false;
			item.folder = false;
			item.index = child.bookmarkIndex;  //This may be unreliable
//			item.index = PlacesUtils.bookmarks.getItemIndex(item.id);
			item.text = [];
			item.number = [];

			//Menu options
			var thisType = type;
			if (child.itemId == PlacesUtils.bookmarksMenuFolderId) {
				thisType = "m";
				this.getMenuOptions(thisType);
			}
//			else if (child.itemId == PlacesUtils.tagsFolderId) {
//				thisType = "t";
//				this.getMenuOptions(thisType);
//			}
			else if (child.itemId == PlacesUtils.toolbarFolderId) {
				thisType = "t";
				this.getMenuOptions(thisType);
			}
			else if (child.itemId == PlacesUtils.unfiledBookmarksFolderId) {
				thisType = "u";
				this.getMenuOptions(thisType);
			}

			if (thisType) {
				//Only carry on if first 'sort by' and 'sort_folder_by' options are not 'unsorted'
				if (this.sp_sortBy[0].match(/^unsorted/) &&
				    (!sortFolders || this.sp_sortBy[2].match(/^unsorted/)))
				{
					continue; //around the for loop
				}

				for (var j=0; j<this.sp_sortBy.length; j++ ) {
					item.text.push(this.getText(child, j, thisType));
					item.number.push(this.getNumber(child, j, thisType));
				}
			}

			if (PlacesUtils.nodeIsQuery(child)) {
				item.order = this.sp_queryOrder;
			}
//			else if (PlacesUtils.nodeIsLivemarkContainer(child)) {
//				item.order = this.sp_livemarkOrder;
//			}
			else if (PlacesUtils.nodeIsBookmark(child)) {
				item.order = this.sp_bookmarkOrder;
			}
			else if (PlacesUtils.nodeIsSeparator(child)) {
				item.sep = true;
				sepIndex.push(item.index);
			}
			else if (PlacesUtils.nodeIsFolder(child)) {
				//Skip special 'no title' admin folder
				if (container.itemId == PlacesUtils.placesRootId && !child.title) {
					try {
						PlacesUtils.annotations.getItemAnnotation(child.itemId, "placesInternal/READ_ONLY");
						continue;
					} catch (e) {
					}
				}

				//Don't sort the tags folder
				if (thisType) {
					//If in 'include' list then sort the containers contents
					var sortTheContainer = sortContents;
					if (!sortTheContainer) {
						for (var j=0; j<this.includeFolders.length; j++) {
							if (child.itemId == this.includeFolders[j]) {
								sortTheContainer = true;
								break;
							}
						}
					}
					item.order = this.sp_folderOrder;
					if (sortFolders) item.folder = true;
					this.sortContainer(child, thisType, sortTheContainer, sortFolders);
				}
			}
			items[child.bookmarkIndex] = item;
		}
		asContainer(container).containerOpen = false;

		if (sortContents && type && items) {
			//Split by separator
			var itemGroup = [];
			var itemIndex = 0;
			itemGroup.push([]);
			for (var i=0; i<items.length; i++ ) {
				if (items[i].sep) {
					itemIndex++;
					itemGroup.push([]);
				}
				else {
					itemGroup[itemIndex].push(items[i]);
				}
			}

			//Sort each separator'd group of items
			for (var i=0; i<itemGroup.length; i++ ) {
				if (itemGroup[i].length) {
					//Sort performed here
					itemGroup[i].sort(this.sortFunction);

					//Now set the indexes, starting with the lowest
					for (var j=0; j<itemGroup[i].length; j++) {
						try {
							var newIndex = sepIndex[i] + 1 + j;
							//You must now set all of them, every time, otherwise the sort won't 'stick'
							if (itemGroup[i][j].id && itemGroup[i][j].index != null && itemGroup[i][j].index != newIndex) {
//Components.utils.reportError(PlacesUtils.bookmarks.getItemTitle(itemGroup[i][j].id) + ":" + itemGroup[i][j].index + ":" + newIndex + ":" + PlacesUtils.bookmarks.getItemIndex(itemGroup[i][j].id));
								PlacesUtils.bookmarks.setItemIndex(itemGroup[i][j].id, newIndex);
							}
						} catch (e) {
						}
					}
				}
			}
		}
	},

	getText: function(child, i, type) {
		var itemText = "";
		var itemType = type + i;

		if (this.sp_sortBy[i] == ("sort_name_" + itemType)) {
			if (child.title)
				itemText = this.sp_caseInsensitive[i] ? child.title.toUpperCase() : child.title;
		}
		else if (this.sp_sortBy[i] == ("sort_description_" + itemType)) {
			var desc = this.getDesc(child.itemId);
			itemText = this.sp_caseInsensitive[i] ? desc.toUpperCase() : desc;
		}
		else if (this.sp_sortBy[i] == ("sort_keyword_" + itemType)) {
			var keyword = PlacesUtils.bookmarks.getKeywordForBookmark(child.itemId);
			if (!keyword) keyword = "";
			itemText = this.sp_caseInsensitive[i] ? keyword.toUpperCase() : keyword;
		}
		else if (this.sp_sortBy[i] == ("sort_location_" + itemType)) {
			//Ignore query URIs
			if (child.uri.substr(0, 6) == "place:") {
				itemText = "";
			}
			//Use feed URI for livemarks
			else if (PlacesUtils.livemarks.isLivemark(child.itemId)) {
				var uri = PlacesUtils.livemarks.getFeedURI(child.itemId);
				itemText = uri ? uri.spec: "";
			}
			else {
				itemText = child.uri;
			}
			itemText = itemText.toUpperCase();
		}
		if (!itemText) itemText = "";	//Catch all just in case assigned to null
		return itemText;
	},

	getDesc: function(itemId) {
	  return PlacesUtils.annotations.itemHasAnnotation(itemId, this.sp_descAnno) ?
	  			 PlacesUtils.annotations.getItemAnnotation(itemId, this.sp_descAnno) :
	   			 "";
	},

	//Dummy function purely for SyncPlaces to work with 3.5
	getDescription: function(itemId) {
	  return "";
	},

	getNumber: function(child, i, type) {
		var itemNumber = 0;
		var itemType = type + i;

		if (this.sp_sortBy[i] == ("sort_date_added_" + itemType))
			itemNumber = child.dateAdded;
		else if (this.sp_sortBy[i] == ("sort_last_modified_" + itemType))
			itemNumber = child.lastModified;
		else if (this.sp_sortBy[i] == ("sort_last_visit_" + itemType))
			itemNumber = child.time;
		else if (this.sp_sortBy[i] == ("sort_visit_count_" + itemType))
			itemNumber = child.accessCount;

		return itemNumber;
	},

	sortFunction: function (a, b) {
		//If equal then use the sortBy values
		function sortByFunction(a, b, i) {
			//Do a lexicographical comparison
			if (SortPlacesSort.sp_text[i]) {
				return a.text[i].localeCompare(b.text[i]) * SortPlacesSort.sp_reverseFactor[i];
			}
			//Date or number comparison
			else {
				if (a.number[i] < b.number[i])
					return -1 * SortPlacesSort.sp_reverseFactor[i];
				else if (a.number[i] > b.number[i])
					return 1 * SortPlacesSort.sp_reverseFactor[i];
				else
					return 0;
			}
		}

		//Precedences first
		var result = 0;
		if (a.order < b.order)
			result = -1;
		else if (a.order > b.order)
			result = 1;

		//If they are both folders then use the folder sortby choice
		else if (a.folder && b.folder) {
			result = sortByFunction(a, b, 2);
		}

		//Otherwise if they are the same precedence (could be folder + bookmark!)
		//then sort them using the 'item' sortby choice
		else {
			result = sortByFunction(a, b, 0);
			//Use the 'Then By' option
			if (result == 0) result = sortByFunction(a, b, 1);
		}

		return result;
	}
};
