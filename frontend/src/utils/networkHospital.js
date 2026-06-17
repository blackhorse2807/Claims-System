export function isNetworkHospital(hospitalName, networkHospitals) {
  if (!hospitalName?.trim()) {
    return false;
  }

  const entered = hospitalName.toLowerCase().trim();

  return networkHospitals.some((hospital) => {
    const network = hospital.toLowerCase().trim();
    return entered.includes(network) || network.includes(entered);
  });
}

export function getMatchedNetworkHospital(hospitalName, networkHospitals) {
  if (!hospitalName?.trim()) {
    return null;
  }

  const entered = hospitalName.toLowerCase().trim();

  return (
    networkHospitals.find((hospital) => {
      const network = hospital.toLowerCase().trim();
      return entered.includes(network) || network.includes(entered);
    }) || null
  );
}
