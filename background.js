const menuItems = ["Summarize", "ELI5"];

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "textActionMenu",
    title: "Small Talk",
    contexts: ["selection"],
  });

  menuItems.forEach((item) => {
    chrome.contextMenus.create({
      id: item.toLowerCase(),
      parentId: "textActionMenu",
      title: item,
      contexts: ["selection"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (menuItems.map((item) => item.toLowerCase()).includes(info.menuItemId)) {
    executeAction(tab.id, info.menuItemId);
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === "summarize" || command === "eli5") {
    executeAction(tab.id, command);
  }
});

function executeAction(tabId, action) {
  chrome.tabs.sendMessage(tabId, { action: "checkSelection" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error checking selection:", chrome.runtime.lastError);
      return;
    }

    if (response && response.hasSelection) {
      sendReplaceTextMessage(tabId, action);
    } else {
      console.log("No text selected. Ignoring command.");
    }
  });
}

function sendReplaceTextMessage(tabId, action) {
  chrome.tabs.sendMessage(
    tabId,
    {
      action: "replaceText",
      aiAction: action,
    },
    (response) => {
      if (chrome.runtime.lastError) {
        console.error("Error sending message:", chrome.runtime.lastError);
      } else {
        console.log("Message sent successfully");
      }
    }
  );
}
