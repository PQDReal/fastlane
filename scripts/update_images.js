const fs = require('fs');

const modelsPath = 'D:\\data vinfast\\vinfast-om\\data\\checkpoints\\models.json';
const vehiclesPath = 'd:\\VSF\\fastlane\\public\\data\\by_type\\manual_vehicles.json';

const modelsData = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
const vehiclesData = JSON.parse(fs.readFileSync(vehiclesPath, 'utf8'));

let updatedCount = 0;

// Iterate over each category (SUV, MiniCar, MPV, etc.)
for (const catId of Object.keys(vehiclesData.data.models)) {
  const categoryModels = vehiclesData.data.models[catId];
  
  for (const car of categoryModels) {
    if (car.model_code && car.model_code.includes('VF') && !car.model_code.includes('e34')) {
      let latestYear = 0;
      let latestUrl = null;
      
      for (const year of car.versions) {
        const key = `${car.model_code}_${year}`;
        if (modelsData[key] && modelsData[key].thumbnail) {
          const url = modelsData[key].thumbnail;
          car.version_thumbnails[year] = url;
          updatedCount++;
          
          if (parseInt(year) > latestYear) {
            latestYear = parseInt(year);
            latestUrl = url;
          }
        }
      }
      
      if (latestUrl) {
        car.thumbnail = latestUrl;
      }
    }
  }
}

fs.writeFileSync(vehiclesPath, JSON.stringify(vehiclesData, null, 2), 'utf8');
console.log(`Updated ${updatedCount} image URLs.`);
