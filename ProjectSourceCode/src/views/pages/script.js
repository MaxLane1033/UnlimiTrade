// Wait until the DOM is fully loaded

document.addEventListener("DOMContentLoaded", function() {
  const addButton = document.getElementById("addFeaturedButton");
 
  addButton.addEventListener("click", function() {
   
    // Create a simple popup element
    const popup = document.createElement("div");
    popup.style.position = "fixed";
    popup.style.top = "50%";
    popup.style.left = "50%";
    popup.style.transform = "translate(-50%, -50%)";
    popup.style.padding = "20px";
    popup.style.backgroundColor = "#fff";
    popup.style.color = "#000";
    popup.style.border = "2px solid #000";
    popup.style.boxShadow = "0 4px 8px rgba(0,0,0,0.3)";
    
    // Set the popup content
    popup.innerHTML = "<p>Hello, this is a simple popup!</p>";
    
    // Add the popup to the body
    document.body.appendChild(popup);
    
    // Remove the popup after 3 seconds
    setTimeout(function() {
      document.body.removeChild(popup);
    }, 3000);
  });
});
