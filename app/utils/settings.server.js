// Server-side code for fetching settings
import https from 'https';
import http from 'http';

/**
 * Fetch button settings from the API with special handling for localhost SSL
 * This file is marked with .server.js to ensure it only runs on the server
 */
export async function fetchButtonSettings(settingsUrl, accessToken) {
  try {
    let settingsData;
    
    // If URL is localhost or a development URL, use a direct approach with SSL verification disabled
    if (settingsUrl.includes('localhost') || settingsUrl.includes('127.0.0.1')) {
      const agent = new https.Agent({
        rejectUnauthorized: false // Only disable verification in development
      });
      
      const settingsResponse = await fetch(settingsUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        agent: function(_parsedURL) {
          if (_parsedURL.protocol === 'https:') {
            return agent;
          }
          return http.globalAgent;
        }
      });
      
      if (settingsResponse.ok) {
        settingsData = await settingsResponse.json();
      }
    } else {
      // Regular fetch for production environments
      const settingsResponse = await fetch(settingsUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      if (settingsResponse.ok) {
        settingsData = await settingsResponse.json();
      }
    }
    
    return settingsData;
  } catch (error) {
    console.error("Error fetching button settings:", error);
    return null;
  }
}
