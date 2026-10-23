import "./_env";
import { seedAll } from "./seedData";

seedAll()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
